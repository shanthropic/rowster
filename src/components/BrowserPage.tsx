import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";

interface BrowserPageProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
  width?: "standard" | "wide";
}

export function BrowserPageLoading({ label }: { label: string }) {
  return (
    <HStack gap={2} align="center" justify="center" className="browser-page-loading">
      <Spinner size="md" label={label} />
    </HStack>
  );
}

export default function BrowserPage({
  title,
  closeLabel,
  onClose,
  actions,
  children,
  width = "wide",
}: BrowserPageProps) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider label={`${title} page header`}>
          <HStack gap={3} padding={4} align="center" justify="between">
            <Heading level={2}>{title}</Heading>
            <HStack gap={2} align="center">
              {actions}
              <IconButton
                size="sm"
                variant="ghost"
                label={closeLabel}
                icon={<X size={16} />}
                onClick={onClose}
                tooltip="Close (Esc)"
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={8} label={`${title} content`}>
        <VStack
          gap={4}
          align="start"
          className={width === "standard" ? "browser-page-standard" : "browser-page-wide"}
        >
          {children}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
