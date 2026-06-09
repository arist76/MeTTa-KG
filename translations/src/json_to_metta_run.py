import sys
from json_to_metta import json_to_dict, dict_to_metta

if __name__ == '__main__':
    filename = sys.argv[1]
    
    with open(f"{filename}.json", "r") as f:
        data = json_to_dict(f)

    with open(f"{filename}-output.metta", "w+") as f:
        dict_to_metta(f, data)
