import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, SlidersHorizontal, Plus, Loader2, Lock, Crown, Folder, FolderPlus, X, Pencil, Trash2, ChevronRight, FileText, Image, Film, Music, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Input as UIInput } from "@/components/ui/input";
import {
  getFolders, createFolder, renameFolder, deleteFolder,
  getLocalFiles, addLocalFile, deleteLocalFile, moveLocalFile, getFilesByFolder
} from "@/lib/localStore";

const FILE_ICONS = {
  PDF: FileText, DOCX: FileText, PPTX: FileText, EPUB: FileText,
  Image: Image, Video: Film, Audio: Music, File: FileText,
};

const sortOptions = [
  { label: "Newest First", key: "date-desc" },
  { label: "Oldest First", key: "date-asc" },
  { label: "Name A–Z", key: "name-asc" },
  { label: "Name Z–A", key: "name-desc" },
];

export default function Library() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.subscription_plan === "pro" || profile?.subscription_plan === "pro_trial";

  // State
  const [folders, setFolders] = useState([]);
  const [localFiles, setLocalFiles] = useState([]);
  const [cloudFiles, setCloudFiles] = useState(null);
  const [activeFolder, setActiveFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [showSort, setShowSort] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Folder management
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [showFolderMenu, setShowFolderMenu] = useState(null);

  // Move file dialog
  const [movingFile, setMovingFile] = useState(null);

  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const sortRef = useRef(null);
  const newFolderRef = useRef(null);

  // Click outside handlers
  useEffect(() => {
    function handleClick(e) {
      if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false);
      if (showFolderMenu && !e.target.closest('[data-folder-menu]')) setShowFolderMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFolderMenu]);

  // Load data
  const loadFolders = useCallback(async () => {
    const f = await getFolders();
    setFolders(f);
  }, []);

  const loadLocalFiles = useCallback(async () => {
    const files = await getLocalFiles();
    setLocalFiles(files);
  }, []);

  const loadCloudFiles = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('created_date', { ascending: false });
      if (error) throw error;
      setCloudFiles(data || []);
    } catch {
      setCloudFiles([]);
    }
  }, [user]);

  useEffect(() => { loadFolders(); loadLocalFiles(); }, [loadFolders, loadLocalFiles]);
  useEffect(() => { if (isPro) loadCloudFiles(); }, [isPro, loadCloudFiles]);

  // ─── Folder actions ─────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const f = await createFolder(newFolderName.trim());
    setFolders(prev => [...prev, f]);
    setNewFolderName("");
    setShowNewFolder(false);
    toast({ title: "Folder created", description: `"${f.name}" is ready.` });
  };

  const handleRenameFolder = async (id) => {
    if (!editFolderName.trim()) return;
    const updated = await renameFolder(id, editFolderName.trim());
    setFolders(updated);
    setEditingFolder(null);
    setEditFolderName("");
  };

  const handleDeleteFolder = async (id) => {
    if (id === "default") return;
    const updated = await deleteFolder(id);
    setFolders(updated);
    await loadLocalFiles();
    if (activeFolder === id) setActiveFolder("all");
    setShowFolderMenu(null);
    toast({ title: "Folder deleted" });
  };

  // ─── File actions ───────────────────────────────────────

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "File too large", description: "Maximum 50MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const folderId = activeFolder === "all" ? "default" : activeFolder;
      const record = await addLocalFile(file, folderId);
      setLocalFiles(prev => [...prev, record]);
      toast({ title: "File saved", description: `${file.name} added to local library.` });
    } catch (err) {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteFile = async (id) => {
    await deleteLocalFile(id);
    setLocalFiles(prev => prev.filter(f => f.id !== id));
    toast({ title: "File deleted" });
  };

  const handleMoveFile = async (fileId, targetFolderId) => {
    const updated = await moveLocalFile(fileId, targetFolderId);
    setLocalFiles(updated);
    setMovingFile(null);
    toast({ title: "File moved" });
  };

  // ─── Derived data ───────────────────────────────────────

  const allLocalFiles = useMemo(() => {
    let visible = activeFolder === "all"
      ? localFiles
      : localFiles.filter(f => f.folderId === activeFolder);

    const q = search.trim().toLowerCase();
    if (q) visible = visible.filter(f => f.name.toLowerCase().includes(q));

    return [...visible].sort((a, b) => {
      switch (sortBy) {
        case "date-asc": return a.created - b.created;
        case "name-asc": return a.name.localeCompare(b.name);
        case "name-desc": return b.name.localeCompare(a.name);
        default: return b.created - a.created;
      }
    });
  }, [localFiles, activeFolder, search, sortBy]);

  const folderCounts = useMemo(() => {
    const counts = { all: localFiles.length };
    localFiles.forEach(f => {
      counts[f.folderId] = (counts[f.folderId] || 0) + 1;
    });
    return counts;
  }, [localFiles]);

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center pt-16 px-5 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Lock className="w-8 h-8 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Library is a Pro feature</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Upload, organize, and manage your study materials with AI-powered quiz generation from your documents.
          </p>
        </div>
        <Button
          onClick={() => navigate("/subscription")}
          className="rounded-xl px-6 font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
        >
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">My Library</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your course materials & files</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-full h-10 px-4 text-xs font-semibold">
            {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Upload
          </Button>
          <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.pptx,.epub,.jpg,.jpeg,.png,.gif" onChange={handleUpload} />
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full h-11 rounded-2xl bg-secondary border border-transparent pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-card transition-colors"
          />
        </div>
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setShowSort(!showSort)}
            className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          {showSort && (
            <div className="absolute right-0 top-12 z-50 w-48 bg-card border border-border rounded-2xl shadow-xl p-1.5">
              {sortOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setSortBy(opt.key); setShowSort(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    sortBy === opt.key ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Folders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold tracking-widest text-muted-foreground">FOLDERS</h3>
          <button
            onClick={() => { setShowNewFolder(true); setTimeout(() => newFolderRef.current?.focus(), 100); }}
            className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80"
          >
            <FolderPlus className="w-3.5 h-3.5" /> New Folder
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 mb-2 animate-fade-in">
            <Input
              ref={newFolderRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              placeholder="Folder name..."
              className="h-9 rounded-xl text-sm"
              autoFocus
            />
            <Button size="sm" onClick={handleCreateFolder} className="h-9 px-3 rounded-xl text-xs">Create</Button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="p-1.5 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Folder chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveFolder("all")}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all ${
              activeFolder === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border border-border text-foreground hover:border-primary/30"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            All
            <span className="opacity-70">({folderCounts.all || 0})</span>
          </button>

          {folders.filter(f => f.id !== "all").map((f) => (
            <div key={f.id} className="relative" data-folder-menu>
              {editingFolder === f.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editFolderName}
                    onChange={(e) => setEditFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(f.id); if (e.key === "Escape") setEditingFolder(null); }}
                    className="h-8 w-24 rounded-full text-xs px-2"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => setActiveFolder(f.id)}
                  onContextMenu={(e) => { e.preventDefault(); setShowFolderMenu(f.id); }}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all ${
                    activeFolder === f.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card border border-border text-foreground hover:border-primary/30"
                  }`}
                >
                  <Folder className="w-3.5 h-3.5" />
                  {f.name}
                  <span className="opacity-70">({folderCounts[f.id] || 0})</span>
                  {f.id !== "default" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFolderMenu(showFolderMenu === f.id ? null : f.id); }}
                      className="ml-0.5 p-0.5 rounded-full hover:bg-primary/20"
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  )}
                </button>
              )}

              {/* Folder menu */}
              {showFolderMenu === f.id && f.id !== "default" && (
                <div className="absolute top-10 left-0 z-50 w-36 bg-card border border-border rounded-xl shadow-xl p-1">
                  <button
                    onClick={() => { setEditingFolder(f.id); setEditFolderName(f.name); setShowFolderMenu(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary rounded-lg"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Rename
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(f.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Files */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="font-bold text-sm text-foreground">
            Files <span className="text-muted-foreground font-medium">({allLocalFiles.length})</span>
          </h3>
          <span className="text-[11px] text-muted-foreground">{sortOptions.find(s => s.key === sortBy)?.label}</span>
        </div>

        <div className="space-y-2">
          {allLocalFiles.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
                <Folder className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search ? "No files match your search" : "No files here yet — upload to get started."}
              </p>
            </div>
          ) : (
            allLocalFiles.map((f, i) => {
              const Icon = FILE_ICONS[f.type] || FileText;
              const created = new Date(f.created);
              const timeStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border shadow-sm animate-fade-in"
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{f.sizeDisplay} · {timeStr}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setMovingFile(f)}
                      className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-lg"
                      title="Move to folder"
                    >
                      <Folder className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteFile(f.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Move file dialog */}
      {movingFile && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setMovingFile(null)}>
          <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Move "{movingFile.name.substring(0, 25)}..."</h3>
              <button onClick={() => setMovingFile(null)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleMoveFile(movingFile.id, f.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    movingFile.folderId === f.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <Folder className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{f.name}</span>
                  {movingFile.folderId === f.id && <span className="text-[10px] text-primary">Current</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
