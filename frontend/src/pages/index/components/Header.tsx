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
        <div class="flex items-center">
          <NameSpace
            namespace={namespace()}
            setNamespace={setNamespace}
            rootToken={rootToken() ? true : false}
            tokenRootNamespace={tokenRootNamespace}
            getAllTokens={getAllTokens}
          />
        </div>
      </header>

      {/* Tabs */}
      <NamespaceTabs />
    </>
  );
}
