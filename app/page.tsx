"use client";

import type { KeyboardEvent } from "react";
import Image from "next/image";
import { BotIcon, SmileIcon } from "lucide-react";
import { useChat } from "ai/react";
import { useRef, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import { codeBlockParse } from "@/lib/utils";

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat();
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imageFileName, setImageFileName] = useState<string | undefined>(
    undefined
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isLoading) return;

    // CTRL + ENTER
    if (event.ctrlKey && event.key === "Enter" && (input || files)) {
      event.preventDefault();

      handleSubmit(event, {
        experimental_attachments: files,
        allowEmptySubmit: true,
      });

      setFiles(undefined);
      setImageUrl(undefined);
      setImageFileName(undefined);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }

    // CTRL + V
    if (event.ctrlKey && event.key === "v") {
      const text = await navigator.clipboard.readText();
      const items = await navigator.clipboard.read();

      if (!text && items) {
        event.preventDefault();

        const dataTransfer = new DataTransfer();

        for (const clipboardItem of items) {
          const types = clipboardItem.types;

          for (const type of types) {
            if (
              type.startsWith("image/") ||
              type.startsWith("application/octet-stream")
            ) {
              const blob = await clipboardItem.getType(type);
              const fileName = `clipboard-file.${type.split("/")[1]}`;
              const file = new File([blob], fileName, { type });
              setImageUrl(URL.createObjectURL(file));
              setImageFileName(fileName);
              dataTransfer.items.add(new File([blob], fileName, { type }));
            }
          }
        }

        setFiles(dataTransfer.files);
      }
    }
  }

  function handleClickTextarea() {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#F6F5F2] relative text-[#555555]">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 py-8">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="flex flex-1 gap-3 mx-auto max-w-[800px] px-5">
                <div className="relative">
                  {m.role === "user" ? <SmileIcon /> : <BotIcon />}
                </div>

                <div className="relative flex flex-col w-11/12">
                  <p className="font-bold">
                    {m.role === "user" ? "User" : "AI"}
                  </p>

                  {m.experimental_attachments && (
                    <div className="my-2">
                      {m.experimental_attachments
                        .filter((attachment) =>
                          attachment?.contentType?.startsWith("image/")
                        )
                        .map((attachment, index) => (
                          <Image
                            key={`${m.id}-${index}`}
                            src={attachment.url}
                            width={500}
                            height={500}
                            alt={attachment.name ?? `attachment-${index}`}
                            className="w-auto h-full rounded-xl object-cover"
                          />
                        ))}
                    </div>
                  )}

                  {m.role === "user" ? (
                    <div className="whitespace-break-spaces">{m.content}</div>
                  ) : (
                    <Markdown>{codeBlockParse(m.content)}</Markdown>
                  )}
                </div>
              </div>
            </div>
          ))}

          {imageUrl && imageFileName && (
            <div>
              <div className="flex flex-1 gap-3 mx-auto max-w-[800px] px-5">
                <div className="relative">
                  <SmileIcon />
                </div>

                <div className="relative flex flex-col w-11/12">
                  <p className="font-bold">User</p>

                  <div className="my-2">
                    <Image
                      src={imageUrl}
                      width={500}
                      height={500}
                      alt={imageFileName}
                      className="w-auto h-full rounded-xl object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="w-full flex flex-col items-center mb-8 px-4">
        <div
          className="rounded-xl border-2 cursor-text max-w-[800px] w-full px-5 py-4"
          onClick={handleClickTextarea}
        >
          <div className="max-h-[50vh] overflow-y-auto w-full mb-[-5px]">
            <textarea
              ref={textareaRef}
              placeholder="メッセージを入力"
              rows={1}
              className="resize-none bg-transparent focus:outline-none w-full"
              /* @ts-ignore */
              style={{ fieldSizing: "content" }}
              onKeyDown={handleKeyDown}
              value={input}
              onChange={handleInputChange}
              autoFocus
            />
          </div>
        </div>
      </div>
    </div>
  );
}
