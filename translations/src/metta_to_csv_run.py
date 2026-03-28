import sys
import os
import hyperon
from io import StringIO
import csv
from typing import Any

sys.path.append(os.path.dirname(__file__))


def metta_to_list(metta_string):
    m = hyperon.MeTTa()
    # Parse the string into atoms
    atoms = m.parse_all(metta_string)
    if not atoms:
        return []
    result = []
    for atom in atoms:
        result.append(atom.get_children())
    return result

def matrix_to_csv_str(m: list[list[Any]]) -> str:
    si = StringIO()
    writer = csv.writer(si, delimiter=',', quotechar='\'', quoting=csv.QUOTE_NONE, escapechar='\'')
    for row in m:
        converted_row = []
        for item in row:
            if isinstance(item, hyperon.SymbolAtom):
                val = item.get_name()
                converted_row.append(val)
            elif isinstance(item, hyperon.GroundedAtom):
                converted_row.append(item.get_object().value)
            elif isinstance(item, hyperon.ExpressionAtom):
                converted_row.append(item)
        writer.writerow(converted_row)
    return si.getvalue()


if __name__ == "__main__":
    try:
        filename = sys.argv[1]
        output_filename = sys.argv[2]
        with open(filename, 'r') as f:
            content = f.read()
        
        # Parse MeTTa content
        matrix = metta_to_list(content)

        # Convert matrix to CSV string
        csv_output = matrix_to_csv_str(matrix)
        
        with open(output_filename, 'w') as f:
            f.write(csv_output)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
