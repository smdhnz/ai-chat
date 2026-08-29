"use client";

import Link from "next/link";
import { ChevronRight, MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import type { Bootstrap, Conversation, Project } from "@/lib/api";
import { ProjectIcon } from "@/components/project-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
} from "@/components/ui/sidebar";

const rowButtonClass =
  "h-[41px] gap-2.5 rounded-[11px] px-[11px] text-xs text-muted-foreground transition duration-200 hover:bg-transparent hover:text-foreground active:bg-transparent data-[active=true]:bg-transparent data-[active=true]:font-normal data-[active=true]:text-foreground [&>svg]:size-[15px] [&>svg]:shrink-0";

const rowActionClass =
  "h-[41px] w-[30px] shrink-0 rounded-[11px] text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg:not([class*='size-'])]:size-[15px]";

function ConversationRow({
  item,
  active,
  nested = false,
  select,
  remove,
}: {
  item: Conversation;
  active: boolean;
  nested?: boolean;
  select: () => void;
  remove: () => void;
}) {
  return (
    <SidebarMenuItem
      className={`flex items-center rounded-[11px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${nested ? "pl-5" : ""} ${active ? "bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))] text-foreground" : ""}`}
    >
      <SidebarMenuButton
        isActive={active}
        className={`${rowButtonClass} min-w-0 flex-1`}
        onClick={select}
      >
        <MessageSquare />
        <span className="truncate text-xs">{item.title}</span>
        {item.unread === 1 && !active && (
          <Badge
            role="status"
            aria-label="新しい応答"
            className="size-[7px] shrink-0 rounded-full border-0 bg-primary p-0"
          />
        )}
      </SidebarMenuButton>
      <Button
        variant="ghost"
        size="icon"
        className={rowActionClass}
        aria-label={`${item.title}を削除`}
        onClick={remove}
      >
        <Trash2 />
      </Button>
    </SidebarMenuItem>
  );
}

export function ChatSidebar({
  data,
  conversationId,
  newChat,
  selectConversation,
  askDeleteConversation,
  askDeleteProject,
}: {
  data: Bootstrap;
  conversationId: string | null;
  newChat: (projectId?: string) => void;
  selectConversation: (item: Conversation) => void;
  askDeleteConversation: (item: Conversation) => void;
  askDeleteProject: (item: Project) => void;
}) {
  return (
    <Sidebar collapsible="offcanvas" className="border-border">
      <SidebarHeader className="px-3.5 pt-[18px] pb-0">
        <Button
          variant="outline"
          className="mx-0.5 mb-5 h-[45px] justify-start gap-2.5 rounded-[14px] border-border bg-card px-3.5 text-[13px] font-semibold shadow-[0_5px_16px_#2926320a] transition duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] max-md:hidden [&_svg:not([class*='size-'])]:size-[17px] [&_svg]:text-primary"
          onClick={() => newChat()}
        >
          <Plus />
          新しいチャット
        </Button>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-3.5">
        <SidebarMenu className="gap-0">
          {data.projects.map((group) => (
            <Collapsible key={group.id} asChild className="group/collapsible mb-[5px]">
              <SidebarMenuItem>
                <div className="flex items-center rounded-[11px] hover:bg-sidebar-accent">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={`${rowButtonClass} h-[39px] min-w-0 flex-1 px-2.5 text-xs font-semibold`}
                    >
                      <ChevronRight className="size-[13px]! transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      <ProjectIcon project={group} className="size-[22px]" />
                      <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 rounded-[11px] text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg:not([class*='size-'])]:size-3.5"
                    aria-label={`${group.name}で新しいチャット`}
                    onClick={() => newChat(group.id)}
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 rounded-[11px] text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg:not([class*='size-'])]:size-3.5"
                    aria-label={`${group.name}を削除`}
                    onClick={() => askDeleteProject(group)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <CollapsibleContent>
                  <SidebarMenuSub className="mx-0 gap-0 border-0 px-0 py-0 pl-0">
                    {data.conversations
                      .filter((item) => !item.temporary && item.project_id === group.id)
                      .map((item) => (
                        <ConversationRow
                          key={item.id}
                          item={item}
                          active={item.id === conversationId}
                          nested
                          select={() => selectConversation(item)}
                          remove={() => askDeleteConversation(item)}
                        />
                      ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
          {data.conversations
            .filter((item) => !item.temporary && !item.project_id)
            .map((item) => (
              <ConversationRow
                key={item.id}
                item={item}
                active={item.id === conversationId}
                select={() => selectConversation(item)}
                remove={() => askDeleteConversation(item)}
              />
            ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="px-3.5 pt-2.5 pb-3.5">
        <Item
          asChild
          size="sm"
          className="gap-2.5 rounded-[15px] p-[9px] transition duration-200 hover:bg-sidebar-accent"
        >
          <Link href="/settings/projects">
            <ItemMedia>
              <Avatar className="size-[34px] rounded-[11px]">
                {data.user.avatar && <AvatarImage src={data.user.avatar} alt="" />}
                <AvatarFallback className="rounded-[11px] bg-muted font-bold">
                  {data.user.display_name[0]}
                </AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent className="gap-0">
              <ItemTitle className="block w-full truncate text-xs font-bold">
                {data.user.display_name}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <Settings className="size-4 text-muted-foreground" />
            </ItemActions>
          </Link>
        </Item>
      </SidebarFooter>
    </Sidebar>
  );
}
