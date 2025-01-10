"use client";

import type { KeyboardEvent } from "react";
import Image from "next/image";
import { BotIcon, SmileIcon } from "lucide-react";
import { toast } from "sonner";
import { useChat } from "ai/react";
import { useRef, useState } from "react";

import { Markdown } from "@/components/markdown";
import { codeBlockParse } from "@/lib/utils";

export default function Page() {
  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
  } = useChat({
    onError: (e) => {
      toast.error(`${e}`);
    },
  });
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isLoading) return;

    // CTRL + ENTER
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();

      handleSubmit(event, {
        experimental_attachments: files,
      });

      setFiles(undefined);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }

    // CTRL + V
    if (event.ctrlKey && event.key === "v") {
      event.preventDefault();

      const text = await navigator.clipboard.readText();

      if (text) {
        setInput((prev) => prev + text);
      } else {
        try {
          const items = await navigator.clipboard.read();
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
                dataTransfer.items.add(new File([blob], fileName, { type }));
              }
            }
          }

          setFiles(dataTransfer.files);
          toast("画像を貼り付けました");
        } catch (error) {
          console.error("Error reading clipboard:", error);
        }
      }
    }
  }

  function handleClickTextarea() {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  return (
    <div className="min-h-screen flex bg-[#212121] relative text-white">
      <div className="grow flex flex-col h-screen">
        <div className="flex-1 overflow-y-auto py-4">
          {messages.map((m) => (
            <div key={m.id} className="px-4 py-4">
              <div className="flex flex-1 gap-3 mx-auto max-w-[800px] px-5">
                <div className="relative">
                  {m.role === "user" ? <CircleUserIcon /> : <BotIcon />}
                </div>
                <div className="relative flex flex-col w-11/12">
                  <p className="font-bold">
                    {m.role === "user" ? "User" : "AI"}
                  </p>
                  {m.role === "user" ? (
                    <div className="whitespace-break-spaces">{m.content}</div>
                  ) : (
                    <Markdown>{codeBlockParse(m.content)}</Markdown>
                  )}
                  <div>
                    {m.experimental_attachments
                      ?.filter((attachment) =>
                        attachment?.contentType?.startsWith("image/")
                      )
                      .map((attachment, index) => (
                        <Image
                          key={`${m.id}-${index}`}
                          src={attachment.url}
                          width={500}
                          height={500}
                          alt={attachment.name ?? `attachment-${index}`}
                        />
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="w-full flex flex-col items-center mb-8 px-4">
          <div
            className="rounded-xl border border-zinc-600 cursor-text max-w-[700px] w-full px-5 py-4"
            onClick={handleClickTextarea}
          >
            <div className="max-h-[50vh] overflow-y-auto w-full mb-[-5px]">
              <textarea
                ref={textareaRef}
                placeholder="メッセージを入力"
                rows={1}
                className="resize-none bg-[#212121] focus:outline-none w-full"
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
    </div>
  );
}
