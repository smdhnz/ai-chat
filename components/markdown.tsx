import * as React from "react";
import Markdown_ from "markdown-to-jsx";
import { ClipboardIcon, ClipboardCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { solarizedlight } from "react-syntax-highlighter/dist/esm/styles/prism";

type Props = {
  children: string;
};

export const Markdown = React.memo(({ children }: Props) => {
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const renderPre = React.useCallback(
    ({ children }: { [k: string]: any }) => {
      const code = React.Children.map(
        children,
        (child) => child.props.children
      ).join("\n");

      const language = React.useMemo(() => {
        return (
          React.Children.toArray(children)
            .find(
              (child): child is React.ReactElement =>
                React.isValidElement(child) && child.type === "code"
            )
            ?.props.className?.match(/lang-(\w+)/)?.[1] || "plaintext"
        );
      }, [children]);

      const [isClick, setIsClick] = React.useState(false);

      const handleClick = React.useCallback(() => {
        handleCopy(code);
        setIsClick(true);
      }, [code, handleCopy]);

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
          <SyntaxHighlighter
            language={language}
            style={solarizedlight}
            customStyle={{
              backgroundColor: "#F0EBE3",
              borderRadius: "0.75rem",
              padding: "20px 24px",
            }}
            className="border"
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );
    },
    [handleCopy]
  );

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
            component: renderPre,
          },
          code: {
            component: "code",
            props: {
              className:
                "bg-[#F0EBE3] text-[#555555] rounded-lg px-1.5 py-0.5 border",
            },
          },
        },
      }}
    >
      {children}
    </Markdown_>
  );
});
