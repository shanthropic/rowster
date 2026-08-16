import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export interface BrowserPageLayoutProps {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  closeLabel?: string;
  onClose: () => void;
  search?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  floatingBar?: ReactNode;
  children: ReactNode;
  maxWidth?: number | string;
  isLoading?: boolean;
  loadingLabel?: string;
}

export function BrowserPageLoading({ label }: { label: string }) {
  return (
    <HStack
      gap={3}
      align="center"
      justify="center"
      className="browser-page-loading"
    >
      <Spinner size="md" aria-label={label} />
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </HStack>
  );
}

export default function BrowserPageLayout({
  title,
  icon,
  subtitle,
  closeLabel = "Close",
  onClose,
  search,
  actions,
  tabs,
  floatingBar,
  children,
  maxWidth = 900,
  isLoading = false,
  loadingLabel = "Loading...",
}: BrowserPageLayoutProps) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider label={`${title} page header`}>
          <VStack gap={0}>
            <HStack
              gap={4}
              padding={4}
              align="center"
              justify="between"
              wrap="wrap"
              className="browser-page-header-row"
            >
              {/* Left: Back Button + Icon + Title & Subtitle */}
              <HStack gap={3} align="center" style={{ minWidth: 0 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  label="Back"
                  icon={<ArrowLeft size={16} />}
                  onClick={onClose}
                />
                {icon ? (
                  <div className="browser-page-title-icon" aria-hidden="true">
                    {icon}
                  </div>
                ) : null}
                <VStack gap={0} align="start">
                  <Heading level={2} className="browser-page-heading">
                    {title}
                  </Heading>
                  {subtitle ? (
                    <Text type="supporting" color="secondary">
                      {subtitle}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>

              {/* Center: Search / Filter input slot */}
              {search ? (
                <div className="browser-page-header-search">{search}</div>
              ) : null}

              {/* Right: Actions + Quick Close Button */}
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

            {/* Optional Tab Navigation */}
            {tabs ? (
              <div className="browser-page-tabs-container">{tabs}</div>
            ) : null}
          </VStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={6} label={`${title} content`}>
        <div
          className="browser-page-content-wrapper"
          style={{ maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth }}
        >
          {isLoading ? (
            <BrowserPageLoading label={loadingLabel} />
          ) : (
            <VStack gap={5} align="stretch" style={{ width: "100%" }}>
              {children}
            </VStack>
          )}
        </div>

        {/* Optional Floating Bottom Notification / Action Bar */}
        {floatingBar ? (
          <div className="browser-page-floating-bar-wrap">{floatingBar}</div>
        ) : null}
      </LayoutContent>
    </Layout>
  );
}
