import sys
import os
import json
from typing import IO
from io import StringIO

# Add current directory to path to allow importing sibling modules
sys.path.append(os.path.dirname(__file__))

from json_to_metta import metta_to_dict

def prepare_file(f: IO[str]) -> IO[str]:
    content = f.read()
    content = content.replace('""', '"')
    return StringIO(content)

if __name__ == "__main__":
    try:
        filename = sys.argv[1]
        output_filename = sys.argv[2]
        with open(filename, 'r') as f:
            f_prepared = prepare_file(f)
            result = metta_to_dict(f_prepared)
        
        with open(output_filename, 'w') as f:
            json.dump(result, f)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
