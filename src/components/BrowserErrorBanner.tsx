import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";

export default function BrowserErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setMessage(typeof detail === "string" ? detail : "The browser action failed.");
    };
    window.addEventListener("rowster:command-error", onError);
    return () => window.removeEventListener("rowster:command-error", onError);
  }, []);

  if (!message) return null;

  return (
    <Banner
      status="error"
      container="section"
      title="Action failed"
      description={message}
      isDismissable
      onDismiss={() => setMessage(null)}
    />
  );
}
