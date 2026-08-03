import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ROOM_TYPES, type RoomType } from "../shared/routines";
import type { DashboardMember } from "./Dashboard";
import { api, failureMessage, jsonInit } from "./api";
import { MemberSelector } from "./MemberSelector";

export type RoomSummary = { id: string; name: string; roomType: RoomType; description: string | null;
  occupantMemberIds: string[]; isActive: number; createdAt: string; updatedAt: string;
  routines: Array<{ id: string; name: string; status: string }> };

function RoomForm({ room, members, saved, cancel }: { room?: RoomSummary; members: DashboardMember[];
  saved: () => Promise<void>; cancel: () => void }) {
  const [occupants, setOccupants] = useState(room?.occupantMemberIds || []); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try { await api(room ? `/api/household/rooms/${room.id}` : "/api/household/rooms", jsonInit(room ? "PATCH" : "POST", {
      name: data.get("name"), roomType: data.get("roomType"), description: data.get("description"), occupantMemberIds: occupants
    })); await saved(); cancel(); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); }
  }
  return <form className="room-space-form" onSubmit={submit}><label><span>Room or space name</span><input name="name" defaultValue={room?.name} required /></label>
    <label><span>Type</span><select name="roomType" defaultValue={room?.roomType || "other"}>{ROOM_TYPES.map((type) =>
      <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
    <label><span>Optional description</span><textarea name="description" defaultValue={room?.description || ""} /></label>
    <MemberSelector members={members} multiple values={occupants} label="Assigned family members" onValuesChange={setOccupants} />
    {error && <p className="error" role="alert">{error}</p>}<div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save room"}</button>
      <button type="button" onClick={cancel}>Cancel</button></div></form>;
}

export function RoomsSpaces({ members, close }: { members: DashboardMember[]; close: () => void }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]); const [editing, setEditing] = useState<RoomSummary | "new" | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try {
    setRooms((await api<{ rooms: RoomSummary[] }>("/api/household/rooms?include=archived")).rooms);
  } catch (reason) { setError(failureMessage(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function archive(room: RoomSummary) { setError(""); try { await api(`/api/household/rooms/${room.id}`, jsonInit("DELETE")); await load(); }
    catch (reason) { setError(failureMessage(reason)); } }
  return <section className="dashboard-card rooms-spaces"><div className="card-heading"><div><p className="eyebrow">Settings / Home setup</p><h1>Rooms &amp; spaces</h1>
    <p>Keep rooms, people and routines connected without losing household history.</p></div><button onClick={close}>Back to Routines</button></div>
    {error && <p className="error" role="alert">{error}</p>}{loading && <p role="status">Loading rooms and spaces…</p>}
    {!editing && <button className="primary" onClick={() => setEditing("new")}>Add room or space</button>}
    {editing && <RoomForm room={editing === "new" ? undefined : editing} members={members} saved={load} cancel={() => setEditing(null)} />}
    <div className="rooms-space-list">{rooms.map((room) => <article key={room.id} className={!room.isActive ? "archived" : ""}><div><h2>{room.name}</h2>
      <p>{ROOM_TYPES.find(({ value }) => value === room.roomType)?.label || room.roomType} · {room.isActive ? "Active" : "Archived"}</p>
      <p>{room.occupantMemberIds.length ? room.occupantMemberIds.map((id) => members.find((member) => member.id === id)?.displayName).filter(Boolean).join(", ") : "No family members assigned"}</p>
      <p><strong>Routines:</strong> {room.routines.length ? room.routines.map(({ name }) => name).join(", ") : "None"}</p></div>
      {Boolean(room.isActive) && <div className="row-actions"><button onClick={() => setEditing(room)}>Edit</button><button className="danger-button" onClick={() => void archive(room)}>Archive</button></div>}
    </article>)}</div></section>;
}
