import React, { useRef, useState } from "react";
import { CloudUpload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

export default function UploadZone({ onUploadSuccess }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const { toast } = useToast();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 50MB limit
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast({
        title: "File too large",
        description: `Maximum file size is 50MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error("You must be logged in to upload files");
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('study-materials')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('study-materials')
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;

      if (!publicUrl) {
        throw new Error("Failed to get file URL");
      }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const sizeKB = (file.size / 1024).toFixed(1);
      const displaySize = file.size >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
      const fileInfo = { 
        name: file.name, 
        size: displaySize, 
        url: publicUrl 
      };
      setUploadedFile(fileInfo);
      onUploadSuccess?.({ url: publicUrl, file });
      
      const isLarge = file.size > 10 * 1024 * 1024;
      toast({ 
        title: "Upload complete", 
        description: isLarge 
          ? `${file.name} is ready. Large files may take a moment to process.`
          : `${file.name} is ready for generation.`,
        duration: isLarge ? 6000 : 3000
      });
    } catch (err) {
      console.error('Upload error:', err);
      toast({ 
        title: "Upload failed", 
        description: "Please check your connection and try again.", 
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className="w-full rounded-2xl border-2 border-dashed border-primary/30 bg-accent/40 hover:bg-accent/60 transition-colors p-8 flex flex-col items-center text-center cursor-pointer"
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          {uploading ? (
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          ) : (
            <CloudUpload className="w-7 h-7 text-primary" />
          )}
        </div>
        <p className="font-semibold text-foreground text-sm">
          {uploading ? "Uploading..." : "Tap to upload course module"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, PPTX, or EPUB up to 50MB</p>
        <Button
          type="button"
          size="sm"
          className="mt-4 h-9 px-5 rounded-full"
          disabled={uploading}
        >
          {uploading ? "Please wait..." : "Browse Files"}
        </Button>
      </div>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.pptx,.epub" onChange={handleFileChange} />

      {uploadedFile && (
        <div className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{uploadedFile.name}</p>
            <p className="text-xs text-muted-foreground">{uploadedFile.size}</p>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 shrink-0">Ready</span>
          <button
            onClick={() => setUploadedFile(null)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
