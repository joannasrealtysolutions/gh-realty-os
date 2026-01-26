"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type Project = {
  id: string;
  property_id: string;
  title: string;
  status: string;
  budget_target: number | null;
  budget_locked: boolean;
  start_date: string | null;
  target_end_date: string | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  cost_est: number | null;
};

type Note = {
  id: string;
  note: string;
  created_at: string;
};

type Photo = {
  id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ContractorProjectPage() {
  const params = useParams();
  const projectId = String(params.projectId || "");

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editTargetEndDate, setEditTargetEndDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      window.location.href = "/login";
      return;
    }

    const pr = await supabase
      .from("rehab_projects")
      .select("id,property_id,title,status,budget_target,budget_locked,start_date,target_end_date")
      .eq("id", projectId)
      .single();

    if (pr.error) {
      setErr(pr.error.message);
      setLoading(false);
      return;
    }

    if (!pr.data) {
      setErr("Project not found.");
      setLoading(false);
      return;
    }

    const p = pr.data as Project;
    setProject(p);
    setEditStatus(p.status);
    setEditStartDate(p.start_date ?? "");
    setEditTargetEndDate(p.target_end_date ?? "");

    const tRes = await supabase
      .from("rehab_tasks")
      .select("id,title,status,due_date,cost_est")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false });

    setTasks((tRes.data ?? []) as Task[]);

    const nRes = await supabase
      .from("rehab_notes")
      .select("id,note,created_at")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false });

    setNotes((nRes.data ?? []) as Note[]);

    const phRes = await supabase
      .from("rehab_photos")
      .select("id,storage_path,caption,created_at")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false });

    setPhotos((phRes.data ?? []) as Photo[]);

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    let todo = 0,
      doing = 0,
      waiting = 0,
      done = 0;
    let cost = 0;

    for (const t of tasks) {
      cost += Number(t.cost_est ?? 0);
      if (t.status === "Doing") doing++;
      else if (t.status === "Waiting") waiting++;
      else if (t.status === "Done") done++;
      else todo++;
    }
    return { todo, doing, waiting, done, cost };
  }, [tasks]);

  const progressPct = useMemo(() => {
    const total = totals.todo + totals.doing + totals.waiting + totals.done;
    if (!total) return 0;
    return Math.round((totals.done / total) * 100);
  }, [totals]);

  const invoices = useMemo(() => {
    return photos.filter((p) => (p.caption ?? "").toLowerCase().startsWith("invoice:"));
  }, [photos]);

  const progressPhotos = useMemo(() => {
    return photos.filter((p) => !(p.caption ?? "").toLowerCase().startsWith("invoice:"));
  }, [photos]);

  async function addTask() {
    if (!project) return;
    const title = newTaskTitle.trim();
    if (!title) return;

    const { error } = await supabase.from("rehab_tasks").insert({
      project_id: project.id,
      title,
      status: "Todo",
    });

    if (error) alert(error.message);
    else {
      setNewTaskTitle("");
      load();
    }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const { error } = await supabase.from("rehab_tasks").update({ status }).eq("id", taskId);
    if (error) alert(error.message);
    else load();
  }

  async function addNote() {
    if (!project) return;
    const note = newNote.trim();
    if (!note) return;

    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) return;

    const { error } = await supabase.from("rehab_notes").insert({
      project_id: project.id,
      author_user_id: uid,
      note,
    });

    if (error) alert(error.message);
    else {
      setNewNote("");
      load();
    }
  }

  async function uploadPhoto(file: File) {
    if (!project) return;

    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) return;

    setUploading(true);
    try {
      const path = `${project.id}/${Date.now()}_${file.name}`.replace(/\s+/g, "_");

      const up = await supabase.storage.from("rehab-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (up.error) throw new Error(up.error.message);

      const { error } = await supabase.from("rehab_photos").insert({
        project_id: project.id,
        author_user_id: uid,
        storage_path: path,
        caption: null,
      });

      if (error) throw new Error(error.message);

      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(message);
    } finally {
      setUploading(false);
    }
  }

  async function uploadInvoice(file: File) {
    if (!project) return;

    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) return;

    setUploading(true);
    try {
      const path = `${project.id}/invoice_${Date.now()}_${file.name}`.replace(/\s+/g, "_");

      const up = await supabase.storage.from("rehab-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (up.error) throw new Error(up.error.message);

      const { error } = await supabase.from("rehab_photos").insert({
        project_id: project.id,
        author_user_id: uid,
        storage_path: path,
        caption: `Invoice: ${file.name}`,
      });

      if (error) throw new Error(error.message);

      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(message);
    } finally {
      setUploading(false);
    }
  }

  async function saveMeta() {
    if (!project) return;
    setSavingMeta(true);
    const { error } = await supabase
      .from("rehab_projects")
      .update({
        status: editStatus,
        start_date: editStartDate || null,
        target_end_date: editTargetEndDate || null,
      })
      .eq("id", project.id);

    if (error) {
      alert(error.message);
    } else {
      load();
    }
    setSavingMeta(false);
  }

  async function openPhoto(path: string) {
    const { data, error } = await supabase.storage.from("rehab-photos").createSignedUrl(path, 60);
    if (error) alert(error.message);
    else window.open(data.signedUrl, "_blank");
  }

  if (loading) return <p className="py-6 text-slate-300">Loading...</p>;
  if (err) return <p className="py-6 text-red-400">{err}</p>;
  if (!project) return <p className="py-6 text-slate-300">Project not found.</p>;

  return (
    <main className="py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          <p className="text-sm text-slate-300 mt-1">
            Status: <span className="text-slate-100">{project.status}</span>
            <span className="text-slate-500"> • </span>
            Project ID: <span className="text-slate-100">{project.id}</span>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 hover:text-white" href="/contractor">
            Back
          </Link>
          <button className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 hover:text-white" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card label="Todo" value={String(totals.todo)} />
        <Card label="Doing" value={String(totals.doing)} />
        <Card label="Waiting" value={String(totals.waiting)} />
        <Card label="Done" value={String(totals.done)} />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card label="Progress" value={`${progressPct}%`} />
        <Card label="Est. Task Cost" value={`$${money(totals.cost)}`} />
        <Card label="Invoices" value={String(invoices.length)} />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <h2 className="font-semibold">Timeline & Status</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-slate-300">Status</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">Start date</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
              type="date"
              value={editStartDate}
              onChange={(e) => setEditStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">Target end date</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
              type="date"
              value={editTargetEndDate}
              onChange={(e) => setEditTargetEndDate(e.target.value)}
            />
          </div>
        </div>
        <button className="mt-4 rounded-xl bg-white text-black px-4 py-2" onClick={saveMeta} disabled={savingMeta}>
          {savingMeta ? "Saving..." : "Save Timeline"}
        </button>
      </section>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <h2 className="font-semibold">Tasks</h2>

          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
              placeholder="Add a task..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button className="rounded-xl bg-white text-black px-4 py-2" onClick={addTask}>
              Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-slate-100">{t.title}</div>
                  <select
                    className="rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                    value={t.status}
                    onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                  >
                    {["Todo", "Doing", "Waiting", "Done"].map((s) => (
                      <option key={s} value={s} className="bg-slate-950">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Due: {t.due_date ?? "-"} • Cost est: {t.cost_est != null ? `$${money(Number(t.cost_est))}` : "-"}
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="text-sm text-slate-400 mt-2">No tasks yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <h2 className="font-semibold">Notes</h2>

          <textarea
            className="mt-4 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
            rows={4}
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />

          <button className="mt-3 rounded-xl bg-white text-black px-4 py-2" onClick={addNote}>
            Add Note
          </button>

          <div className="mt-4 space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="text-slate-100 whitespace-pre-wrap">{n.note}</div>
                <div className="text-xs text-slate-500 mt-2">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
            {notes.length === 0 && <p className="text-sm text-slate-400 mt-2">No notes yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <h2 className="font-semibold">Invoices</h2>
          <p className="text-xs text-slate-500 mt-1">Upload invoices as PDF or image.</p>
          <div className="mt-3 flex items-center gap-3">
            <label className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white cursor-pointer">
              Upload invoice
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadInvoice(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {uploading && <span className="text-xs text-slate-500">Uploading...</span>}
          </div>

          <div className="mt-4 space-y-2">
            {invoices.map((ph) => (
              <button
                key={ph.id}
                className="block text-left text-slate-200 hover:text-white underline"
                onClick={() => openPhoto(ph.storage_path)}
              >
                {ph.caption ?? ph.storage_path}
              </button>
            ))}
            {invoices.length === 0 && <p className="text-sm text-slate-400">No invoices uploaded yet.</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <h2 className="font-semibold">Photos</h2>
        <p className="text-sm text-slate-400 mt-1">Upload progress photos.</p>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhoto(f);
            }}
          />
          {uploading && <span className="text-sm text-slate-300">Uploading...</span>}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {progressPhotos.map((p) => (
            <button
              key={p.id}
              className="text-left rounded-xl border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-900"
              onClick={() => openPhoto(p.storage_path)}
            >
              <div className="text-sm text-slate-100 break-all">{p.storage_path}</div>
              <div className="text-xs text-slate-500 mt-1">{new Date(p.created_at).toLocaleString()}</div>
            </button>
          ))}
          {progressPhotos.length === 0 && <p className="text-sm text-slate-400">No photos yet.</p>}
        </div>
      </section>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
