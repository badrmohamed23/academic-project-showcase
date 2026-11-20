import seed from "./database.seed.json";

type Row = Record<string, any>;
export type JsonUser = {
  id: string;
  email: string;
  password: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
};

export type JsonSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_at: number;
  user: JsonUser;
};

type State = {
  auth: {
    users: JsonUser[];
    currentUserId: string | null;
    pendingResetEmail: string | null;
  };
  tables: Record<string, Row[]>;
  storage: Record<
    string,
    Record<
      string,
      { name: string; contentType: string; dataUrl: string; size: number; updated_at: string }
    >
  >;
};

type RealtimeSpec = {
  event: string;
  schema: string;
  table: string;
  filter?: string;
};

type RealtimeSubscription = {
  spec: RealtimeSpec;
  callback: (payload: any) => void;
};

type ChannelHandle = {
  unsubscribe: () => void;
};

const DB_KEY = "bug-busters.json-db.v2";
const LARGE_FILE_THRESHOLD_BYTES = 1_500_000;
const listeners = new Set<(event: string, session: any) => void>();
const channelSubscriptions = new Map<string, RealtimeSubscription[]>();
const transientStorageUrls = new Map<string, Map<string, string>>();
let memoryState: State | null = null;

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyState(): State {
  return {
    auth: { users: [], currentUserId: null, pendingResetEmail: null },
    tables: {},
    storage: {},
  };
}

function normalizeState(input?: Partial<State> | null): State {
  const next = createEmptyState();
  if (input?.auth?.users) next.auth.users = clone(input.auth.users);
  if (input?.auth?.currentUserId !== undefined)
    next.auth.currentUserId = input.auth.currentUserId ?? null;
  if (input?.auth?.pendingResetEmail !== undefined)
    next.auth.pendingResetEmail = input.auth.pendingResetEmail ?? null;
  if (input?.tables) next.tables = clone(input.tables);
  if (input?.storage) next.storage = clone(input.storage);
  return next;
}

function mergeSeedRows(state: State) {
  const seedState = seed as Partial<State>;
  if (seedState.auth?.users) {
    const knownUsers = new Set(state.auth.users.map((user) => user.id));
    for (const user of seedState.auth.users) {
      if (!knownUsers.has(user.id)) state.auth.users.push(clone(user));
    }
  }
  if (seedState.tables) {
    for (const [table, rows] of Object.entries(seedState.tables)) {
      const currentRows = tableRows(state, table);
      const knownIds = new Set(currentRows.map((row) => row.id));
      for (const row of rows ?? []) {
        if (row?.id && !knownIds.has(row.id)) currentRows.push(clone(row));
      }
      state.tables[table] = currentRows;
    }
  }
  if (seedState.storage) {
    for (const [bucket, files] of Object.entries(seedState.storage)) {
      state.storage[bucket] = { ...(state.storage[bucket] ?? {}), ...(files ?? {}) };
    }
  }
}

function readState() {
  if (typeof window === "undefined") {
    if (!memoryState) memoryState = normalizeState(seed as Partial<State>);
    mergeSeedRows(memoryState);
    return memoryState;
  }
  const raw = window.localStorage.getItem(DB_KEY);
  if (raw) {
    try {
      const loaded = normalizeState(JSON.parse(raw) as State);
      mergeSeedRows(loaded);
      window.localStorage.setItem(DB_KEY, JSON.stringify(loaded));
      return loaded;
    } catch {
      // fall through to seed state
    }
  }
  const next = normalizeState(seed as Partial<State>);
  mergeSeedRows(next);
  window.localStorage.setItem(DB_KEY, JSON.stringify(next));
  return next;
}

function writeState(next: State) {
  if (typeof window === "undefined") {
    memoryState = next;
    return;
  }
  window.localStorage.setItem(DB_KEY, JSON.stringify(next));
}

function withState<T>(handler: (state: State) => T): T {
  const state = readState();
  const result = handler(state);
  writeState(state);
  return result;
}

function emitAuth(event: string, session: any) {
  for (const listener of listeners) listener(event, session);
}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTransientStorageUrl(bucket: string, path: string) {
  return transientStorageUrls.get(bucket)?.get(path) ?? null;
}

function setTransientStorageUrl(bucket: string, path: string, url: string) {
  const bucketUrls = transientStorageUrls.get(bucket) ?? new Map<string, string>();
  bucketUrls.set(path, url);
  transientStorageUrls.set(bucket, bucketUrls);
}

function clearTransientStorageUrl(bucket: string, path: string) {
  const bucketUrls = transientStorageUrls.get(bucket);
  const url = bucketUrls?.get(path);
  if (
    url &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function" &&
    url.startsWith("blob:")
  ) {
    URL.revokeObjectURL(url);
  }
  bucketUrls?.delete(path);
  if (bucketUrls && bucketUrls.size === 0) transientStorageUrls.delete(bucket);
}

function matchesFilter(row: Row, filter?: string) {
  if (!filter) return true;
  const parts = filter.split(".");
  if (parts.length < 3) return true;
  const [column, operator] = parts;
  const value = parts.slice(2).join(".");
  if (operator !== "eq") return true;
  return String(row[column] ?? "") === value;
}

function emitTableChange(
  table: string,
  event: "INSERT" | "UPDATE" | "DELETE",
  nextRow: Row | null,
  previousRow: Row | null = null,
) {
  const candidate = nextRow ?? previousRow;
  if (!candidate) return;
  for (const subscriptions of channelSubscriptions.values()) {
    for (const subscription of subscriptions) {
      const spec = subscription.spec;
      if (spec.schema !== "public" || spec.table !== table) continue;
      if (spec.event !== "*" && spec.event !== event) continue;
      if (!matchesFilter(candidate, spec.filter)) continue;
      subscription.callback({
        eventType: event,
        schema: spec.schema,
        table,
        new: nextRow,
        old: previousRow,
      });
    }
  }
}

function notifyUser(
  state: State,
  userId: string,
  type: string,
  title: string,
  body: string | null = null,
  linkUrl: string | null = null,
) {
  const pref = tableRows(state, "notification_preferences").find((item) => item.user_id === userId);
  if (pref?.notifications_enabled === false) return null;
  const row = {
    id: createId(),
    user_id: userId,
    type,
    title,
    body,
    link_url: linkUrl,
    is_read: false,
    created_at: nowIso(),
  };
  tableRows(state, "notifications").push(row);
  emitTableChange("notifications", "INSERT", row, null);
  return row.id;
}

function notifyAdmins(
  state: State,
  type: string,
  title: string,
  body: string | null = null,
  linkUrl: string | null = null,
) {
  const adminIds = tableRows(state, "user_roles")
    .filter((item) => item.role === "admin")
    .map((item) => item.user_id);
  for (const adminId of adminIds) {
    notifyUser(state, adminId, type, title, body, linkUrl);
  }
}

function getSession(user: any) {
  if (!user) return null;
  return {
    access_token: `local-${user.id}`,
    refresh_token: `local-${user.id}`,
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user,
  };
}

function tableRows(state: State, table: string) {
  if (!state.tables[table]) state.tables[table] = [];
  return state.tables[table];
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseNested(token: string) {
  const aliasMatch = token.match(/^([^:(]+)(?::([^()]+))?\((.*)\)$/);
  if (aliasMatch)
    return {
      alias: aliasMatch[1].trim(),
      foreignKey: aliasMatch[2]?.trim() ?? null,
      inner: aliasMatch[3].trim(),
    };
  const relationMatch = token.match(/^([^()]+)\((.*)\)$/);
  if (relationMatch)
    return { alias: relationMatch[1].trim(), foreignKey: null, inner: relationMatch[2].trim() };
  return null;
}

function projectRelated(
  table: string,
  relation: string,
  row: Row,
  inner: string,
  foreignKey: string | null,
) {
  if (table === "projects" && relation === "project_flags") {
    return tableRows(readState(), relation)
      .filter((item) => item.project_id === row.id)
      .map((item) => projectRow(relation, item, inner));
  }
  const sourceField =
    foreignKey ??
    (row.course_id
      ? "course_id"
      : row.project_id
        ? "project_id"
        : row.student_id
          ? "student_id"
          : row.instructor_id
            ? "instructor_id"
            : row.employer_id
              ? "employer_id"
              : null);
  const targetId = sourceField ? row[sourceField] : null;
  if (!targetId) return null;
  const target = tableRows(readState(), relation).find((item) => item.id === targetId);
  return target ? projectRow(relation, target, inner) : null;
}

function projectRow(table: string, row: Row, selectSpec: string) {
  if (!selectSpec || selectSpec === "*") return clone(row);
  const out: Row = {};
  for (const token of splitTopLevel(selectSpec)) {
    if (token === "*") {
      Object.assign(out, clone(row));
      continue;
    }
    const nested = parseNested(token);
    if (nested) {
      out[nested.alias] = projectRelated(table, nested.alias, row, nested.inner, nested.foreignKey);
      continue;
    }
    out[token] = row[token];
  }
  return out;
}

function applyFilters(rows: Row[], filters: Array<(row: Row) => boolean>) {
  return rows.filter((row) => filters.every((filter) => filter(row)));
}

function compareValues(left: any, right: any) {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function evaluateClause(row: Row, clause: string) {
  const parts = clause.split(".");
  if (parts.length < 3) return false;
  const column = parts[0];
  const operator = parts[1];
  const value = parts.slice(2).join(".");
  const rowValue = row[column];

  if (operator === "eq") return String(rowValue ?? "") === value;
  if (operator === "ilike") {
    const normalized = String(value).toLowerCase().replaceAll("%", "");
    return String(rowValue ?? "")
      .toLowerCase()
      .includes(normalized);
  }

  return false;
}

async function toDataUrl(file: File | Blob) {
  if (typeof FileReader !== "undefined" && file instanceof Blob) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
    return {
      dataUrl,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      name: file instanceof File ? file.name : "file",
    };
  }
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    dataUrl: `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`,
    size: file.size,
    contentType: file.type || "application/octet-stream",
    name: file instanceof File ? file.name : "file",
  };
}

class QueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }> = [];
  private limitValue: number | null = null;
  private selectValue = "*";
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private onConflict: string | null = null;
  private head = false;
  private countMode: string | undefined;
  private singleMode: "none" | "single" | "maybe" = "none";

  constructor(private table: string) {}

  select(selectSpec = "*", options?: { head?: boolean; count?: string }) {
    if (this.action === "select") this.action = "select";
    this.selectValue = selectSpec;
    this.head = Boolean(options?.head);
    this.countMode = options?.count;
    return this;
  }
  insert(values: any) {
    this.action = "insert";
    this.payload = values;
    return this;
  }
  update(values: any) {
    this.action = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  upsert(values: any, options?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = values;
    this.onConflict = options?.onConflict ?? null;
    return this;
  }
  eq(column: string, value: any) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: any) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: any[]) {
    const set = new Set(values.map((item) => String(item)));
    this.filters.push((row) => set.has(String(row[column])));
    return this;
  }
  or(expression: string) {
    const clauses = splitTopLevel(expression)
      .map((clause) => clause.trim())
      .filter(Boolean);
    if (clauses.length)
      this.filters.push((row) => clauses.some((clause) => evaluateClause(row, clause)));
    return this;
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }
  limit(count: number) {
    this.limitValue = count;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onFulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onFulfilled, onRejected);
  }

  private execute() {
    return withState(async (state) => {
      const rows = tableRows(state, this.table);
      const filtered = applyFilters(rows, this.filters);
      const ordered = [...filtered].sort((left, right) => {
        for (const order of this.orders) {
          const comparison = compareValues(left[order.column], right[order.column]);
          if (comparison !== 0) return order.ascending ? comparison : -comparison;
        }
        return 0;
      });
      const limited = this.limitValue === null ? ordered : ordered.slice(0, this.limitValue);

      if (this.action === "select") {
        if (this.head)
          return {
            data: null,
            error: null,
            count: this.countMode === "exact" ? limited.length : undefined,
          };
        const selected = limited.map((row) => projectRow(this.table, row, this.selectValue));
        if (this.singleMode === "single")
          return {
            data: selected[0] ?? null,
            error: selected.length === 1 ? null : { message: "Expected a single row." },
          };
        if (this.singleMode === "maybe")
          return {
            data: selected[0] ?? null,
            error: selected.length <= 1 ? null : { message: "Expected zero or one row." },
          };
        return { data: selected, error: null };
      }

      if (this.action === "insert") {
        const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const inserted = payloads.map((entry) => {
          const next = { ...entry };
          if (!next.id) next.id = createId();
          if (!next.created_at) next.created_at = nowIso();
          if (!next.updated_at) next.updated_at = nowIso();
          if (!next.applied_at && this.table === "applications") next.applied_at = nowIso();
          if (this.table === "conversations" && !next.last_message_at)
            next.last_message_at = next.created_at;
          rows.push(next);
          return next;
        });
        state.tables[this.table] = rows;
        if (this.table === "messages") {
          const updatedConversations = tableRows(state, "conversations").map((conversation) => {
            const insertedMessage = inserted[0] ?? null;
            if (!insertedMessage || conversation.id !== insertedMessage.conversation_id)
              return conversation;
            return {
              ...conversation,
              last_message_at: insertedMessage.created_at,
              updated_at: nowIso(),
            };
          });
          state.tables.conversations = updatedConversations;
        }
        if (this.table === "project_collaborators") {
          for (const row of inserted) {
            const project =
              tableRows(state, "projects").find((item) => item.id === row.project_id) ?? null;
            notifyUser(
              state,
              row.invitee_id,
              "collab_invite",
              "You were invited to collaborate",
              `Project: ${project?.title ?? "Project"}`,
              "/dashboard/invitations",
            );
          }
        }
        if (this.table === "instructor_link_requests") {
          const admins = tableRows(state, "user_roles")
            .filter((item) => item.role === "admin")
            .map((item) => item.user_id);
          for (const row of inserted) {
            for (const adminId of admins) {
              notifyUser(
                state,
                adminId,
                "link_request",
                "New instructor course link request",
                `Action: ${row.action}`,
                "/dashboard/link-requests",
              );
            }
          }
        }
        if (this.table === "messages") {
          for (const row of inserted) {
            const conversation =
              tableRows(state, "conversations").find((item) => item.id === row.conversation_id) ??
              null;
            if (!conversation) continue;
            const otherId =
              row.sender_id === conversation.user_a ? conversation.user_b : conversation.user_a;
            const sender =
              tableRows(state, "profiles").find((item) => item.id === row.sender_id) ?? null;
            const senderName =
              [sender?.first_name, sender?.last_name].filter(Boolean).join(" ").trim() ||
              sender?.company_name ||
              sender?.email ||
              "Someone";
            notifyUser(
              state,
              otherId,
              "new_message",
              `New message from ${senderName}`,
              String(row.body ?? "").slice(0, 120),
              "/dashboard/messages",
            );
          }
        }
        if (this.table === "project_comments") {
          for (const row of inserted) {
            const project =
              tableRows(state, "projects").find((item) => item.id === row.project_id) ?? null;
            if (!project) continue;
            const context = row.task_id
              ? "task"
              : row.thesis_id
                ? "thesis draft"
                : "project";
            notifyUser(
              state,
              project.student_id,
              "project_feedback",
              "New feedback on your project",
              `An instructor commented on your ${context}: "${String(row.body ?? "").slice(0, 100)}${String(row.body ?? "").length > 100 ? "..." : ""}"`,
              "/dashboard/my-portfolio",
            );
          }
        }
        if (this.table === "project_ratings") {
          for (const row of inserted) {
            const project =
              tableRows(state, "projects").find((item) => item.id === row.project_id) ?? null;
            if (!project) continue;
            notifyUser(
              state,
              project.student_id,
              "project_feedback",
              "New rating on your project",
              `An instructor rated your project ${row.rating}/5${row.comment ? `: "${String(row.comment).slice(0, 100)}${String(row.comment).length > 100 ? "..." : ""}"` : ""}`,
              "/dashboard/my-portfolio",
            );
          }
        }
        for (const row of inserted) emitTableChange(this.table, "INSERT", row, null);
        const selected = inserted.map((row) => projectRow(this.table, row, this.selectValue));
        return {
          data: Array.isArray(this.payload) ? selected : (selected[0] ?? null),
          error: null,
        };
      }

      if (this.action === "update") {
        const payload = this.payload ?? {};
        const previousRows = rows.filter((row) => filtered.includes(row));
        const updated = rows.map((row) =>
          filtered.includes(row)
            ? { ...row, ...payload, updated_at: payload.updated_at ?? nowIso() }
            : row,
        );
        state.tables[this.table] = updated;
        if (this.table === "project_collaborators") {
          for (const previous of previousRows) {
            const next = { ...previous, ...payload };
            if (
              next.status !== previous.status &&
              (next.status === "accepted" || next.status === "rejected")
            ) {
              const project =
                tableRows(state, "projects").find((item) => item.id === next.project_id) ?? null;
              if (project)
                notifyUser(
                  state,
                  project.student_id,
                  "collab_response",
                  `Collaboration ${next.status}`,
                  `Project: ${project.title}`,
                  "/dashboard/projects",
                );
            }
          }
        }
        if (this.table === "applications") {
          for (const previous of previousRows) {
            const next = { ...previous, ...payload };
            if (
              next.status !== previous.status &&
              (next.status === "accepted" || next.status === "rejected")
            ) {
              const internship =
                tableRows(state, "internships").find((item) => item.id === next.internship_id) ??
                null;
              const employer = internship
                ? (tableRows(state, "profiles").find(
                    (item) => item.id === internship.employer_id,
                  ) ?? null)
                : null;
              const company = employer?.company_name || employer?.email || "a company";
              notifyUser(
                state,
                next.student_id,
                "application_status",
                `Application ${next.status}`,
                `Your application to "${internship?.title ?? "an internship"}" at ${company} was ${next.status}.`,
                "/dashboard/internships",
              );
            }
          }
        }
        for (const previous of previousRows) {
          const next = { ...previous, ...payload, updated_at: payload.updated_at ?? nowIso() };
          emitTableChange(this.table, "UPDATE", next, previous);
        }
        const selected = filtered.map((row) =>
          projectRow(this.table, { ...row, ...payload }, this.selectValue),
        );
        return { data: selected, error: null };
      }

      if (this.action === "delete") {
        state.tables[this.table] = rows.filter((row) => !filtered.includes(row));
        for (const row of filtered) emitTableChange(this.table, "DELETE", null, row);
        const selected = filtered.map((row) => projectRow(this.table, row, this.selectValue));
        return { data: selected, error: null };
      }

      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const conflictKey = this.onConflict ?? "id";
      const upserted = payloads.map((entry) => {
        const next = { ...entry };
        if (!next.id) next.id = createId();
        if (!next.created_at) next.created_at = nowIso();
        next.updated_at = nowIso();
        const index = rows.findIndex((row) => row[conflictKey] === next[conflictKey]);
        if (index >= 0) rows[index] = { ...rows[index], ...next };
        else rows.push(next);
        return next;
      });
      state.tables[this.table] = rows;
      for (const row of upserted) emitTableChange(this.table, "INSERT", row, null);
      const selected = upserted.map((row) => projectRow(this.table, row, this.selectValue));
      return { data: selected, error: null };
    });
  }
}

function createAuthApi() {
  return {
    async signUp({ email, password, options }: any) {
      const normalized = String(email).trim().toLowerCase();
      return withState((state) => {
        const existing = state.auth.users.find((user) => user.email.toLowerCase() === normalized);
        if (existing)
          return {
            data: { user: existing, session: getSession(existing) },
            error: { message: "A user with this email already exists." },
          };
        const role = String(options?.data?.role ?? "student");
        const user = {
          id: createId(),
          email: normalized,
          password: String(password),
          first_name: options?.data?.first_name ?? null,
          last_name: options?.data?.last_name ?? null,
          company_name: options?.data?.company_name ?? null,
          role,
          is_active: true,
          avatar_url: null,
          created_at: nowIso(),
        };
        state.auth.users.push(user);
        state.auth.currentUserId = user.id;
        const profiles = tableRows(state, "profiles");
        const existingProfile = profiles.find((item) => item.id === user.id);
        const profile = {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          company_name: user.company_name,
          is_active: true,
          avatar_url: null,
          created_at: user.created_at,
          updated_at: nowIso(),
        };
        if (existingProfile) Object.assign(existingProfile, profile);
        else profiles.push(profile);
        state.tables.profiles = profiles;
        const roles = tableRows(state, "user_roles");
        const existingRole = roles.find((item) => item.user_id === user.id);
        const roleRow = { user_id: user.id, role };
        if (existingRole) Object.assign(existingRole, roleRow);
        else roles.push(roleRow);
        state.tables.user_roles = roles;
        if (role === "student") {
          const rows = tableRows(state, "student_profiles");
          if (!rows.find((item) => item.id === user.id))
            rows.push({
              id: user.id,
              bio: null,
              major: null,
              skills: [],
              contributor_score: 0,
              education: null,
              links: [],
              linkedin_url: null,
              created_at: user.created_at,
              updated_at: nowIso(),
            });
        }
        if (role === "instructor") {
          const rows = tableRows(state, "instructor_profiles");
          if (!rows.find((item) => item.id === user.id))
            rows.push({
              id: user.id,
              bio: null,
              education: [],
              research_interests: [],
              created_at: user.created_at,
              updated_at: nowIso(),
            });
        }
        if (role === "employer") {
          const rows = tableRows(state, "employer_profiles");
          if (!rows.find((item) => item.id === user.id)) {
            rows.push({
              id: user.id,
              address: null,
              bio: null,
              contact_info: null,
              latitude: null,
              longitude: null,
              location_address: null,
              reviewed_at: null,
              reviewed_by: null,
              tax_document_path: null,
              verification_notes: null,
              verification_status: "pending",
              created_at: user.created_at,
              updated_at: nowIso(),
            });
            notifyAdmins(
              state,
              "employer_pending",
              "New employer pending verification",
              "A new employer submitted documents for review.",
              "/dashboard/employer-verification",
            );
          }
        }
        const session = getSession(user);
        emitAuth("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      });
    },
    async signInWithPassword({ email, password }: any) {
      const normalized = String(email).trim().toLowerCase();
      return withState((state) => {
        const user =
          state.auth.users.find(
            (entry) =>
              entry.email.toLowerCase() === normalized && entry.password === String(password),
          ) ?? null;
        if (!user)
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials." },
          };
        state.auth.currentUserId = user.id;
        const session = getSession(user);
        emitAuth("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      });
    },
    async signOut() {
      return withState((state) => {
        state.auth.currentUserId = null;
        state.auth.pendingResetEmail = null;
        emitAuth("SIGNED_OUT", null);
        return { error: null };
      });
    },
    async resetPasswordForEmail(email: string) {
      return withState((state) => {
        state.auth.pendingResetEmail = String(email).trim().toLowerCase();
        return { data: {}, error: null };
      });
    },
    async verifyOtp({ email, token }: any) {
      return withState((state) => {
        const normalized = String(email).trim().toLowerCase();
        const user =
          state.auth.users.find((entry) => entry.email.toLowerCase() === normalized) ?? null;
        if (!user || state.auth.pendingResetEmail !== normalized || String(token).length !== 6) {
          return {
            data: { user: null, session: null },
            error: { message: "Could not verify code." },
          };
        }
        state.auth.currentUserId = user.id;
        const session = getSession(user);
        emitAuth("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      });
    },
    async updateUser({ password }: any) {
      return withState((state) => {
        const user =
          state.auth.users.find((entry) => entry.id === state.auth.currentUserId) ?? null;
        if (!user) return { data: { user: null }, error: { message: "No authenticated user." } };
        user.password = String(password);
        return { data: { user }, error: null };
      });
    },
    onAuthStateChange(callback: any) {
      listeners.add(callback);
      setTimeout(
        () =>
          callback(
            "INITIAL_SESSION",
            getSession(
              readState().auth.users.find((entry) => entry.id === readState().auth.currentUserId) ??
                null,
            ),
          ),
        0,
      );
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    async getSession() {
      const state = readState();
      return {
        data: {
          session: getSession(
            state.auth.users.find((entry) => entry.id === state.auth.currentUserId) ?? null,
          ),
        },
        error: null,
      };
    },
    async getClaims() {
      const state = readState();
      const user = state.auth.users.find((entry) => entry.id === state.auth.currentUserId) ?? null;
      return {
        data: { claims: user ? { sub: user.id } : null },
        error: user ? null : { message: "No active session." },
      };
    },
  };
}

function createStorageApi() {
  return {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          file: File | Blob,
          options?: { upsert?: boolean; contentType?: string },
        ) {
          const isLargeFile = file.size > LARGE_FILE_THRESHOLD_BYTES;
          const payload =
            isLargeFile && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
              ? {
                  dataUrl: "",
                  size: file.size,
                  contentType: file.type || options?.contentType || "application/octet-stream",
                  name: file instanceof File ? file.name : "file",
                }
              : await toDataUrl(file);
          return withState((state) => {
            const files = state.storage[bucket] ?? {};
            if (!options?.upsert && files[path])
              return { data: null, error: { message: "File already exists." } };
            files[path] = {
              ...payload,
              contentType: options?.contentType ?? payload.contentType,
              updated_at: nowIso(),
            };
            state.storage[bucket] = files;
            if (
              isLargeFile &&
              typeof URL !== "undefined" &&
              typeof URL.createObjectURL === "function"
            ) {
              clearTransientStorageUrl(bucket, path);
              setTransientStorageUrl(bucket, path, URL.createObjectURL(file));
            } else {
              clearTransientStorageUrl(bucket, path);
            }
            return { data: { path }, error: null };
          });
        },
        getPublicUrl(path: string) {
          const state = readState();
          return {
            data: {
              publicUrl:
                getTransientStorageUrl(bucket, path) ??
                state.storage[bucket]?.[path]?.dataUrl ??
                "",
            },
          };
        },
        async createSignedUrl(path: string) {
          const state = readState();
          return {
            data: {
              signedUrl:
                getTransientStorageUrl(bucket, path) ??
                state.storage[bucket]?.[path]?.dataUrl ??
                "",
            },
            error: null,
          };
        },
        async download(path: string) {
          const state = readState();
          const file = state.storage[bucket]?.[path];
          const transientUrl = getTransientStorageUrl(bucket, path);
          if (!file && !transientUrl) return { data: null, error: { message: "File not found." } };
          const response = await fetch(transientUrl ?? file.dataUrl);
          return { data: await response.blob(), error: null };
        },
        async remove(paths: string[]) {
          return withState((state) => {
            const files = state.storage[bucket] ?? {};
            for (const path of paths) {
              delete files[path];
              clearTransientStorageUrl(bucket, path);
            }
            state.storage[bucket] = files;
            return { data: null, error: null };
          });
        },
      };
    },
  };
}

function createFunctionsApi() {
  return {
    async invoke(name: string, options?: { body?: any }) {
      if (name !== "create-admin")
        return {
          data: null,
          error: { message: `Function ${name} is not available in local mode.` },
        };
      return createAuthApi().signUp({
        email: options?.body?.email,
        password: options?.body?.password,
        options: {
          data: {
            first_name: options?.body?.first_name,
            last_name: options?.body?.last_name,
            role: "admin",
          },
        },
      });
    },
  };
}

function createChannelApi(name: string) {
  const subscriptions: RealtimeSubscription[] = [];
  const api = {
    on(event: string, spec: RealtimeSpec, callback: (payload: any) => void) {
      subscriptions.push({ spec: { ...spec, event }, callback });
      return api;
    },
    subscribe() {
      const existing = channelSubscriptions.get(name) ?? [];
      channelSubscriptions.set(name, existing.concat(subscriptions));
      return {
        unsubscribe: () => {
          const current = channelSubscriptions.get(name) ?? [];
          const remaining = current.filter((entry) => !subscriptions.includes(entry));
          if (remaining.length > 0) channelSubscriptions.set(name, remaining);
          else channelSubscriptions.delete(name);
        },
      } as ChannelHandle;
    },
  };
  return api;
}

export function createJsonDbClient() {
  return {
    auth: createAuthApi(),
    from(table: string) {
      return new QueryBuilder(table);
    },
    storage: createStorageApi(),
    functions: createFunctionsApi(),
    channel(name: string) {
      return createChannelApi(name);
    },
    async removeChannel(channel: ChannelHandle) {
      channel?.unsubscribe?.();
      return { data: null, error: null };
    },
  };
}
