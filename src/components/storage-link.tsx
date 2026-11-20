import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type StorageLinkProps = {
  bucket: string;
  path: string | null;
  className?: string;
  children: ReactNode;
};

export function StorageLink({ bucket, path, className, children }: StorageLinkProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return () => {
        active = false;
      };
    }

    setUrl(null);
   void (async () => {
  if (bucket === "thesis-drafts") {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path);
    if (!active) return;
    setUrl(data?.signedUrl ?? null);
  } else {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!active) return;
    setUrl(data.publicUrl ?? null);
  }
})();

    return () => {
      active = false;
    };
  }, [bucket, path]);

  if (!path) return null;

  const isVideo = path.match(/\.(mp4|webm|mov|avi|mkv)$/i);

  if (isVideo) {
    return (
      <button
        type="button"
        className={cn(className, !url && "pointer-events-none opacity-60")}
        onClick={async () => {
  if (!url) return;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh">
          <video controls autoplay style="max-width:100%;max-height:100vh">
            <source src="${objectUrl}" />
          </video>
        </body>
      </html>
    `);
    win.document.close();
  } catch {
    window.open(url, "_blank");
  }
}}
      >
        {children}
      </button>
    );
  }

  return (
    <a
    
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      data-disabled={!url || undefined}
      className={cn(className, !url && "pointer-events-none opacity-60")}
    >
      {children}
    </a>
  );
}