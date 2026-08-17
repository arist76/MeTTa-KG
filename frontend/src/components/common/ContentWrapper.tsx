import { children, createMemo, type JSXElement } from "solid-js";
import { useLocation } from "@solidjs/router";

interface ContentWrapperProps {
  children: JSXElement;
}

// Pages that should always be full width
const fullWidthPages = ["/", "/explore", "/load"];

export default function ContentWrapper(props: ContentWrapperProps) {
  const location = useLocation();
  const resolved = children(() => props.children);

  const isFullWidth = createMemo(() => {
    const path = location.pathname;
    return fullWidthPages.includes(path);
  });

  return (
    <div
      class={isFullWidth() ? "h-full w-full" : "h-full w-full container-main"}
    >
      {resolved()}
    </div>
  );
}
