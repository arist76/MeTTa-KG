import { Component } from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import NotImplemented from "~/components/common/NotImplemented";

const UnionPage: Component = () => {
  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Union"
        description="Compute the union of two knowledge graphs."
      >
        <NotImplemented name="Union" />
      </CommandCard>
    </div>
  );
};

export default UnionPage;
