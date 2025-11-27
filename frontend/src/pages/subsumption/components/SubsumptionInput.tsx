import { For } from "solid-js";
import { Button } from "~/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/Card";
import { Trash2 } from "lucide-solid";
import NameSpace from "~/pages/index/components/NameSpace";

type Token = {
  namespace: string;
  description: string;
};

export interface Item {
  id: string;
  namespace: string[];
}

interface SubsumptionInputProps {
  type: "patterns" | "templates";
  items: Item[];
  addItem: () => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, field: "namespace", value: string[]) => void;
  accentColor: string;
  rootToken: boolean;
  tokenRootNamespace: () => string[];
  getAllTokens: () => Promise<Token[]>;
}

export function SubsumptionInput(props: SubsumptionInputProps) {
  const title = props.type === "patterns" ? "Patterns" : "Templates";
  const description =
    props.type === "patterns"
      ? "Define patterns to match against"
      : "Define templates for Subsumptions";

  return (
    <Card class={`border-l-4 border-l-${props.accentColor}`}>
      <CardHeader>
        <div class="flex items-center">
          <div
            class={`w-2 h-2 bg-${props.accentColor} rounded-full mr-2`}
          ></div>
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <For each={props.items}>
            {(item) => (
              <div class="flex gap-2 bg-neutral-800 p-3">
                <div class="flex-1 flex flex-col gap-2">
                  <NameSpace
                    namespace={item.namespace}
                    setNamespace={(ns) =>
                      props.updateItem(item.id, "namespace", ns)
                    }
                    rootToken={props.rootToken}
                    tokenRootNamespace={props.tokenRootNamespace}
                    getAllTokens={props.getAllTokens}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => props.removeItem(item.id)}
                  disabled={props.items.length === 1}
                  class="text-destructive hover:text-destructive self-center"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            )}
          </For>
        </div>
      </CardContent>
    </Card>
  );
}
