import type { Component } from "solid-js";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/TextField";
import { showToast } from "~/components/ui/Toast";

interface ExportFormProps {
  max_write?: number | null;
  setMaxWrite: (value: number | null) => void;
  isLoading: boolean;
}

export const MaxWriteForm: Component<ExportFormProps> = (props) => {

  const handleMaxWriteInput = (e: InputEvent) => {
    let val = Number(e.currentTarget.value);

    if (val<0){ 
      showToast({ 
        title: "only positive numbers allowed", 
        variant: "destructive", 
      }) 
      props.setMaxWrite(0)
    }else{
      props.setMaxWrite(val) 
    }
  };

  return (
    <TextField class="space-y-2">
      <TextFieldLabel for="max-write">Max Records</TextFieldLabel>
      <TextFieldInput
        id="max-write"
        type="number"
        value={props.max_write ?? props.setMaxWrite(15)}
        onInput={handleMaxWriteInput}
        disabled={props.isLoading}
      />
    </TextField>
  );
};
