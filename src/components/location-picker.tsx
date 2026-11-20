import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Props {
  lat: number | null;
  lng: number | null;
  address: string | null;
  onChange: (v: { lat: number; lng: number; address: string }) => void;
}

const CAIRO: [number, number] = [30.0444, 31.2357];

export function LocationPicker({ lat, lng, address, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const initial = useMemo<[number, number]>(
    () => (lat != null && lng != null ? [lat, lng] : CAIRO),
    [lat, lng],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import Leaflet only on client side
    import("leaflet").then((L) => {
      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const map = L.map(containerRef.current).setView(initial, lat != null ? 14 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;

      if (lat != null && lng != null) {
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", async () => {
          const p = markerRef.current!.getLatLng();
          const addr = await reverseGeocode(p.lat, p.lng);
          onChange({ lat: p.lat, lng: p.lng, address: addr });
        });
      }

      map.on("click", async (e: any) => {
        placeMarker(e.latlng.lat, e.latlng.lng);
        const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng);
        onChange({ lat: e.latlng.lat, lng: e.latlng.lng, address: addr });
      });

      return () => {
        map.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeMarker = (la: number, ln: number) => {
    import("leaflet").then((L) => {
      if (!mapRef.current) return;
      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln]);
      } else {
        markerRef.current = L.marker([la, ln], { icon, draggable: true }).addTo(mapRef.current);
        markerRef.current.on("dragend", async () => {
          const p = markerRef.current!.getLatLng();
          const addr = await reverseGeocode(p.lat, p.lng);
          onChange({ lat: p.lat, lng: p.lng, address: addr });
        });
      }
      mapRef.current.setView([la, ln], Math.max(mapRef.current.getZoom(), 14));
    });
  };

  const reverseGeocode = async (la: number, ln: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}`,
        {
          headers: { Accept: "application/json" },
        },
      );
      const data = (await res.json()) as { display_name?: string };
      return data.display_name ?? `${la.toFixed(5)}, ${ln.toFixed(5)}`;
    } catch {
      return `${la.toFixed(5)}, ${ln.toFixed(5)}`;
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      );
      const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!arr.length) {
        toast.error("No matching location found");
        return;
      }
      const la = parseFloat(arr[0].lat);
      const ln = parseFloat(arr[0].lon);
      placeMarker(la, ln);
      onChange({ lat: la, lng: ln, address: arr[0].display_name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Search address or place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={searching} onClick={() => void search()}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <div ref={containerRef} className="h-72 w-full rounded-md border z-0" />
      {address && (
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {address}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Click the map or drag the pin to set your company location.
      </p>
    </div>
  );
}
