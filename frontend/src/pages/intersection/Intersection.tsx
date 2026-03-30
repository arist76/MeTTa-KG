import { Component } from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import NotImplemented from "~/components/common/NotImplemented";

const IntersectionPage: Component = () => {
  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Intersection"
        description="Compute the intersection of two knowledge graphs."
      >
        <NotImplemented name="Intersection" />
      </CommandCard>
    </div>
  );
};

export default IntersectionPage;
