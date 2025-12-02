import type { Component } from "solid-js";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/TextField";
import { handleInput } from "../lib";

interface ExportFormProps {
  max_write?: number | null;
  setMaxWrite: (value: number | null) => void;
  isLoading: boolean;
}

export const MaxWriteForm: Component<ExportFormProps> = (props) => {
  return (
    <TextField class="space-y-2">
      <TextFieldLabel for="max-write">Max Records</TextFieldLabel>
      <TextFieldInput
        id="max-write"
        type="number"
        value={props.max_write ?? props.setMaxWrite(15)}
        onInput={handleInput}
        disabled={props.isLoading}
      />
    </TextField>
  );
};
