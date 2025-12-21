// components/InstanceCard.tsx
import { MorkInstance, activeMorkPort, setActiveMorkPort } from "../lib";
import CpuIcon from "lucide-solid/icons/cpu";
import BoxIcon from "lucide-solid/icons/box";
import PowerIcon from "lucide-solid/icons/power";

export const InstanceCard = (props: { instance: MorkInstance, onRefresh: () => void }) => {
  const isActive = () => activeMorkPort() === props.instance.port;

  return (
    <div 
      class={`p-4 border rounded-lg transition-all cursor-pointer flex flex-col gap-3 ${
        isActive() ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/50"
      }`}
      onClick={() => setActiveMorkPort(props.instance.port)}
    >
      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-bold text-lg">Port: {props.instance.port}</h3>
          <span class="text-xs text-muted-foreground">ID: {props.instance.id}</span>
        </div>
        <div class={`px-2 py-1 rounded text-xs font-medium ${
          props.instance.status === 'running' ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"
        }`}>
          {props.instance.status.toUpperCase()}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mt-2">
        <div class="flex items-center gap-2 text-sm">
          <CpuIcon size={16} class="text-muted-foreground" />
          <span>{props.instance.cpu}%</span>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <BoxIcon size={16} class="text-muted-foreground" />
          <span>{props.instance.memory} MB</span>
        </div>
      </div>

      <button 
        class={`w-full py-2 rounded text-sm font-semibold transition-colors ${
          isActive() ? "bg-primary text-white" : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        }`}
      >
        {isActive() ? "Active Instance" : "Select Instance"}
      </button>
    </div>
  );
};