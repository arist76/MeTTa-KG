import D3TreeGraph from "../D3SpaceGraph";
import type { SpaceNode } from "~/lib/space";

interface ExpandableListProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  isIndented?: boolean;
  ref?: (api: {
    expandAll: () => void;
    collapseAll: () => void;
    collapseToRoot: () => void;
  }) => void;
}

export default function ExpandableList(props: ExpandableListProps) {
  return (
    <D3TreeGraph
      data={props.data}
      pattern={props.pattern}
      ref={props.ref}
    />
  );
}
