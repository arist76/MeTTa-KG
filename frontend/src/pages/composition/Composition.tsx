import { Component } from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import NotImplemented from "~/components/common/NotImplemented";

const CompositionPage: Component = () => {
  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Composition"
        description="Compose two knowledge graphs together."
      >
        <NotImplemented name="Composition" />
      </CommandCard>
    </div>
  );
};

export default CompositionPage;
