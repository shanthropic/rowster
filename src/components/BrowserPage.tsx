import type { ReactNode } from "react";
import BrowserPageLayout, {
  BrowserPageLoading,
} from "./common/BrowserPageLayout";

export { BrowserPageLoading };

export interface BrowserPageProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
  width?: "standard" | "wide";
  search?: ReactNode;
  tabs?: ReactNode;
  icon?: ReactNode;
  subtitle?: string;
  floatingBar?: ReactNode;
  isLoading?: boolean;
}

export default function BrowserPage({
  title,
  closeLabel,
  onClose,
  actions,
  children,
  width = "wide",
  search,
  tabs,
  icon,
  subtitle,
  floatingBar,
  isLoading,
}: BrowserPageProps) {
  return (
    <BrowserPageLayout
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
      actions={actions}
      maxWidth={width === "standard" ? 860 : 960}
      search={search}
      tabs={tabs}
      icon={icon}
      subtitle={subtitle}
      floatingBar={floatingBar}
      isLoading={isLoading}
    >
      {children}
    </BrowserPageLayout>
  );
}
