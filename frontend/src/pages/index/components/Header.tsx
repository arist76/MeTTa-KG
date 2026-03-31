import NameSpace from "./NameSpace";
import NamespaceTabs from "~/pages/index/components/NamespaceTabs";
import { getAllTokens } from "~/lib/api";
import {
  rootToken,
  namespace,
  setNamespace,
  tokenRootNamespace,
} from "~/lib/state";
import ExternalLink from "lucide-solid/icons/external-link";
import Sun from "lucide-solid/icons/sun";
import Moon from "lucide-solid/icons/moon";
import { useColorMode } from "@kobalte/core";

export default function Header() {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <>
      {/* Header */}
      <header
        class="flex items-center justify-between px-4"
        style={{
          background: "var(--header-bg)",
          "border-bottom": "1px solid var(--header-border)",
          height: "52px",
          "min-height": "52px",
        }}
      >
        {/* Left: Namespace breadcrumb */}
        <div class="flex items-center h-full">
          <NameSpace
            namespace={namespace()}
            setNamespace={setNamespace}
            rootToken={rootToken() ? true : false}
            tokenRootNamespace={tokenRootNamespace}
            getAllTokens={getAllTokens}
          />
        </div>

        {/* Right: External links and Theme Toggle */}
        <div class="flex items-center gap-1 flex-shrink-0">
          {[
            { label: "MORK", href: "https://github.com/trueagi-io/MORK" },
            { label: "DOCS", href: "https://github.com/trueagi-io/MORK/wiki" },
            {
              label: "COMMUNITY",
              href: "https://chat.singularitynet.io/chat/channels/mork",
            },
          ].map((link, i, arr) => (
            <>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-widest transition-all duration-200 text-muted-foreground hover:text-primary hover:bg-primary/10"
                style={{ "letter-spacing": "0.1em" }}
              >
                {link.label}
                <ExternalLink class="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              {i < arr.length - 1 && (
                <span class="text-primary/25 text-[10px]">·</span>
              )}
            </>
          ))}

          <div class="w-px h-4 bg-border mx-2" />

          {/* Theme Toggle Button */}
          <button
            onClick={toggleColorMode}
            class="flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors duration-200 ml-1"
            title={`Switch to ${colorMode() === 'light' ? 'dark' : 'light'} mode`}
          >
            {colorMode() === "dark" ? (
              <Sun class="w-4 h-4" />
            ) : (
              <Moon class="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Namespace Tabs */}
      <NamespaceTabs class="flex items-stretch" />
    </>
  );
}
