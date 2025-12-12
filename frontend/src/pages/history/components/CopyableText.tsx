import { Component, Show, createSignal } from "solid-js";
import Copy from "lucide-solid/icons/copy";
import Check from "lucide-solid/icons/check";

interface CopyableTextProps {
  text: string | undefined | null;
  id: string;
  fallback?: string;
}

const CopyableText: Component<CopyableTextProps> = (props) => {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = () => {
    if (props.text) {
      navigator.clipboard.writeText(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Show when={props.text || props.fallback}>
      <div class="relative group bg-muted p-2 rounded font-mono text-xs whitespace-pre-wrap break-all">
        {props.text || props.fallback}
        <Show when={props.text}>
          <button
            onClick={handleCopy}
            class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Show when={copied()} fallback={<Copy class="h-3 w-3" />}>
              <Check class="h-3 w-3 text-green-500" />
            </Show>
          </button>
        </Show>
      </div>
    </Show>
  );
};

export default CopyableText;
