import * as React from "react";
import Markdown_ from "markdown-to-jsx";
import { ClipboardIcon, ClipboardCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  children: string;
};

export const Markdown = ({ children }: Props) => {
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <Markdown_
      options={{
        overrides: {
          h1: {
            component: "h1",
            props: {
              className:
                "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
            },
          },
          h2: {
            component: "h2",
            props: {
              className:
                "mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0",
            },
          },
          h3: {
            component: "h3",
            props: {
              className:
                "mt-8 scroll-m-20 text-2xl font-semibold tracking-tight",
            },
          },
          p: {
            component: "p",
            props: {
              className: "leading-7 [&:not(:first-child)]:mt-4",
            },
          },
          blockquote: {
            component: "blockquote",
            props: {
              className: "mt-6 border-l-2 pl-6 italic",
            },
          },
          ul: {
            component: "ul",
            props: {
              className: "my-6 ml-8 list-disc [&>li]:mt-2",
            },
          },
          li: {
            component: "li",
            props: {
              className: "mt-2",
            },
          },
          table: {
            component: "table",
            props: {
              className: "w-full my-6 rounded-xl",
            },
          },
          th: {
            component: "th",
            props: {
              className:
                "border px-2 py-1 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right",
            },
          },
          td: {
            component: "td",
            props: {
              className:
                "border px-2 py-1 text-left text-sm [&[align=center]]:text-center [&[align=right]]:text-right",
            },
          },
          pre: {
            component: ({ children, ...props }: { [k: string]: any }) => {
              const code = React.Children.map(
                children,
                (child) => child.props.children
              ).join("\n");

              const [isClick, setIsClick] = React.useState(false);

              const handleClick = () => {
                handleCopy(code);
                setIsClick(true);
              };

              return (
                <div className="relative">
                  <Button
                    onClick={handleClick}
                    className="absolute top-2 right-2"
                    size="icon"
                    variant="ghost"
                  >
                    {isClick ? <ClipboardCheckIcon /> : <ClipboardIcon />}
                  </Button>
                  <pre
                    {...props}
                    className="overflow-x-auto mt-3 px-6 py-5 bg-[#F0EBE3] rounded-xl"
                  >
                    {React.Children.map(children, (child) =>
                      React.cloneElement(child, {
                        className: "bg-[#F0EBE3] text-[#555555]",
                      })
                    )}
                  </pre>
                </div>
              );
            },
          },
          code: {
            component: "code",
            props: {
              className: "bg-[#F0EBE3] text-[#555555] rounded-xl px-2 py-1.5",
            },
          },
        },
      }}
    >
      {children}
    </Markdown_>
  );
};
