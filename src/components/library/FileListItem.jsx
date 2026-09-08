import React from "react";
import { FileText, Presentation, BookOpen, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/supabaseClient";
import { useNavigate } from "react-router-dom";

import { format, isToday, isYesterday } from "date-fns";

const typeStyles = {
  PDF: { icon: FileText, classes: "bg-red-100 text-red-600" },
  DOCX: { icon: FileText, classes: "bg-blue-100 text-blue-600" },
  PPTX: { icon: Presentation, classes: "bg-orange-100 text-orange-600" },
  EPUB: { icon: BookOpen, classes: "bg-emerald-100 text-emerald-600" },
};

function uploadedLabel(dateStr, size, slides) {
  const d = dateStr ? new Date(dateStr) : null;
  const when = d
    ? isToday(d) ? "Uploaded today" : isYesterday(d) ? "Uploaded yesterday" : `Uploaded ${format(d, "MMM d, yyyy")}`
    : "Uploaded";
  return [when, size, slides ? `${slides} slides` : null].filter(Boolean).join(" \u2022 ");
}

export default function FileListItem({ file, index, onDeleted, onQuizGenerated }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { icon: Icon, classes } = typeStyles[file.file_type] || typeStyles.PDF;

  const handleDelete = async () => {
    try {
      if (file.file_url) {
        const path = file.file_url.split('/storage/v1/object/public/study-materials/')[1];
        if (path) await supabase.storage.from('study-materials').remove([path]);
      }
      await supabase.from('files').delete().eq('id', file.id);
      onDeleted?.(file.id);
      toast({ title: "File removed", description: file.filename });
    } catch (err) {
      toast({ title: "Delete failed", description: "Please try again later.", variant: "destructive" });
    }
  };

  const handleGenerate = () => {
    navigate('/', { state: { selectedFileId: file.id, selectedFileName: file.filename } });
    toast({ title: "Opening Create", description: `Generate a quiz from ${file.filename}` });
  };

  return (
    <div
      className="rounded-2xl bg-card border border-border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/20 animate-fade-in"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
    >
      <div className="flex gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${classes}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{file.filename}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {uploadedLabel(file.created_date, file.file_size, file.slide_count)}
          </p>
          {file.folder && file.folder !== "All Files" && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] font-semibold text-primary bg-accent px-2 py-0.5 rounded-full">
                {file.folder}
              </span>
            </div>
          )}
          {typeof file.comprehension_index === "number" && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {file.comprehension_index}% comprehension index
            </p>
          )}
        </div>
        <div className="flex flex-col items-end justify-between shrink-0 gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={handleDelete} className="text-sm text-red-600">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={handleGenerate} className="h-8 rounded-full text-[11px] font-semibold px-3">
            Generate Quiz
          </Button>
        </div>
      </div>
    </div>
  );
}
