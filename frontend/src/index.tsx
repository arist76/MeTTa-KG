/* @refresh reload */
import { render } from "solid-js/web";
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core";
import ErrorBoundary from "~/components/common/ErrorBoundary";
import App from "~/pages/index/Index";
import { ToastViewport } from "~/components/ui/Toast";
import "./app.css";

if (import.meta.env.DEV) {
  import("solid-devtools");
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Wrapper div not found");
}

render(() => {
  const storageManager = createLocalStorageManager("vite-ui-theme");
  return (
    <>
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ToastViewport />
      </ColorModeProvider>
    </>
  );
}, root);
