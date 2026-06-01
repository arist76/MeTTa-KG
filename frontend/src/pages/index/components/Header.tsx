import NameSpace from "./NameSpace";
import NamespaceTabs from "~/pages/index/components/NamespaceTabs";
import { getAllTokens } from "~/lib/api";
import {
  rootToken,
  namespace,
  setNamespace,
  tokenRootNamespace,
} from "~/lib/state";

export default function Header() {
  return (
    <>
      {/* Header with Namespace Breadcrumb */}
      <header class="bg-card border-b border-border flex items-center justify-between px-4 py-3">
        <div class="flex items-center min-w-0">
          <NameSpace
            namespace={namespace()}
            setNamespace={setNamespace}
            rootToken={rootToken() ? true : false}
            tokenRootNamespace={tokenRootNamespace}
            getAllTokens={getAllTokens}
          />
        </div>

        {/* External Links */}
        <div class="hidden sm:flex items-center gap-3 text-xs flex-shrink-0">
          <a
            href="https://github.com/trueagi-io/MORK"
            class="uppercase text-muted-foreground hover:text-primary transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            MORK
          </a>
          <span class="text-muted-foreground/40">·</span>
          <a
            href="https://github.com/trueagi-io/MORK/wiki"
            class="uppercase text-muted-foreground hover:text-primary transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            DOCS
          </a>
          <span class="text-muted-foreground/40">·</span>
          <a
            href="https://chat.singularitynet.io/chat/channels/mork"
            class="uppercase text-muted-foreground hover:text-primary transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            COMMUNITY
          </a>
        </div>
      </header>

      {/* Tabs */}
      <NamespaceTabs />
    </>
  );
}
