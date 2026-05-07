import { Show, Component } from "solid-js";
import { Button } from "~/components/ui/Button";
import { CommandCard } from "~/components/common/CommandCard";
import {
  TextField,
  TextFieldLabel,
  TextFieldInput,
} from "~/components/ui/TextField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/Select";
import { OutputViewer } from "./components/OutputViewer";
import Loader2 from "lucide-solid/icons/loader-2";
import Download from "lucide-solid/icons/download";
import MettaEditor from "~/components/common/MettaEditor";
import { formatedNamespace } from "~/lib/state";
import {
  format,
  setFormat,
  isLoading,
  isAppBusy,
  pattern,
  setPattern,
  template,
  setTemplate,
  result,
  exportError,
  handleExport,
  handleDownload,
  maxWrite,
  isInputValid,
  handleInput,
  ExportFormat,
  activeExportAction,
} from "./lib";

const ExportPage: Component = () => {
  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Export Data"
        description="Export data to a file in the specified format. Supports local files and remote URLs."
      >
        <div class="space-y-4">
          <div class="space-y-4">
            <TextField>
              <TextFieldLabel>Patterns</TextFieldLabel>
              <MettaEditor
                initialText={pattern()}
                onTextChange={setPattern}
                onPatternLoad={() => {}}
                parseErrors={[]}
                showActionButtons={false}
              />
            </TextField>
            <TextField>
              <TextFieldLabel>Templates</TextFieldLabel>
              <MettaEditor
                initialText={template()}
                onPatternLoad={() => {}}
                onTextChange={setTemplate}
                parseErrors={[]}
                showActionButtons={false}
              />
            </TextField>
          </div>

          {/* TODO: add support for file exports */}
          {/* <TextField class="space-y-2"> */}
          {/*   <TextFieldLabel for="export-uri">Export URI</TextFieldLabel> */}
          {/*   <TextFieldInput */}
          {/*     id="export-uri" */}
          {/*     value={uri()} */}
          {/*     onInput={(e) => setUri(e.currentTarget.value)} */}
          {/*     placeholder="file:///..." */}
          {/*     disabled={isLoading()} */}
          {/*   /> */}
          {/* </TextField> */}
          <div class="flex items-end gap-4">
            <div class="flex-grow">
              <TextField class="space-y-2">
                <TextFieldLabel for="export-format">Format</TextFieldLabel>
                <Select<ExportFormat>
                  options={["metta", "json", "csv", "raw"]}
                  value={format()}
                  onChange={setFormat}
                  disabled={!!isLoading() || isAppBusy()}
                  placeholder="Select a format"
                  itemComponent={(props) => (
                    <SelectItem item={props.item}>
                      {props.item.rawValue.toUpperCase()}
                    </SelectItem>
                  )}
                >
                  <SelectTrigger id="export-format">
                    <SelectValue<string>>
                      {(state) => state.selectedOption()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </TextField>
            </div>
            <TextField class="space-y-2">
              <TextFieldLabel for="max-write">Max Records</TextFieldLabel>
              <TextFieldInput
                id="max-write"
                type="number"
                value={maxWrite() ?? ""}
                onInput={handleInput}
                disabled={!!isLoading() || isAppBusy()}
              />
            </TextField>
          </div>
        </div>

        <div class="mt-4 flex justify-between items-center">
          <Button
            onClick={() => handleExport(formatedNamespace())}
            disabled={
              !!isLoading() ||
              isAppBusy() ||
              !pattern().trim() ||
              !template().trim() ||
              !isInputValid(maxWrite())
            }
            class="w-36"
          >
            <Show
              when={isLoading() && activeExportAction() === "export"}
              fallback={
                <>
                  <Download class="mr-2 h-4 w-4" />
                  Export Data
                </>
              }
            >
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </Show>
          </Button>

          <Button
            onClick={() => handleDownload(formatedNamespace())}
            disabled={isAppBusy() || !pattern().trim() || !template().trim()}
            class="w-37"
          >
            <Show
              when={isLoading() && activeExportAction() === "download"}
              fallback={
                <>
                  <Download class="mr-2 h-4 w-4" />
                  Export to File
                </>
              }
            >
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </Show>
          </Button>
        </div>

        {/* Show OutputViewer for both success and error cases */}
        <Show when={result() || exportError()}>
          <div class="mt-4">
            <OutputViewer
              title="Export Result"
              data={exportError() ? exportError()!.message : result()}
              status={exportError() ? "error" : "success"}
              format={format()}
            />
          </div>
        </Show>
      </CommandCard>
    </div>
  );
};

export default ExportPage;
