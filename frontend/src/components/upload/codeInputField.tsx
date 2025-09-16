import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field"

interface CodeInputFieldProps {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    rows?: number
    syntax?: string
}

export const CodeInputField = (props: CodeInputFieldProps) => {
    return (
        <div class="space-y-2">
            <TextField>
                <TextFieldLabel for={props.label.toLowerCase().replace(/\s+/g, "-")}>{props.label}</TextFieldLabel>
                <TextFieldTextArea
                    id={props.label.toLowerCase().replace(/\s+/g, "-")}
                    value={props.value}
                    onChange={(e) => props.onChange(e.target.value)}
                    placeholder={props.placeholder}
                    rows={props.rows || 4}
                    class="font-mono text-sm"
                    aria-describedby={`${props.label.toLowerCase().replace(/\s+/g, "-")}-description`}
                />
                <p id={`${props.label.toLowerCase().replace(/\s+/g, "-")}-description`} class="text-xs text-muted-foreground">
                    {props.syntax === "metta" ? "MeTTa S-Expression syntax" : `${props.syntax} format`}
                </p>
            </TextField>
        </div>
    )
}

