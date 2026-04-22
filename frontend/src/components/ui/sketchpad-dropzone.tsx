import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type DropFile = {
  id: string;
  file: File;
};

interface SketchpadDropzoneProps {
  files: DropFile[];
  onDrop?: (files: FileList) => void;
  onRemove?: (id: string) => void;
}

export function SketchpadDropzone({ files, onDrop, onRemove }: SketchpadDropzoneProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && onDrop) {
      onDrop(e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && onDrop) {
      onDrop(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <div>
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} />

      <div
        onClick={handleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="relative border-2 border-dashed border-gray-400/60 rounded-lg p-8 min-h-[260px] bg-white/80 flex flex-wrap gap-4 items-start cursor-pointer text-zinc-900"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(0,0,0,0.04) 25px), repeating-linear-gradient(-90deg, transparent, transparent 24px, rgba(0,0,0,0.04) 25px)",
        }}
      >
        <AnimatePresence>
          {files.map((file) => (
            <motion.div
              key={file.id}
              initial={{ scale: 0, rotate: -5, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              <Card className="w-44 bg-yellow-50 shadow-lg relative">
                <CardContent className="p-2 flex justify-between items-center gap-2">
                  <p className="font-medium text-sm break-all line-clamp-2">{file.file.name}</p>
                  {onRemove ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(file.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
