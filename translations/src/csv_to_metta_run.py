import sys
from csv_to_metta import csv_to_matrix, matrix_to_row_based_metta, matrix_to_column_based_metta, matrix_to_cell_metta_unlabeled, matrix_to_cell_metta_labeled

if __name__ == '__main__':
    filename = sys.argv[1]
    direction = sys.argv[2]
    delimiter = sys.argv[3]

    matrix = csv_to_matrix(f"{filename}.csv", delimiter=delimiter)
    if direction == '1':
        metta = matrix_to_row_based_metta(matrix)
    elif direction == '2':
        metta = matrix_to_column_based_metta(matrix)
    elif direction == '3':
        metta = matrix_to_cell_metta_unlabeled(matrix)
    elif direction == '4':
        metta = matrix_to_cell_metta_labeled(matrix)
    else:
        raise Exception("Invalid parse direction")

    with open(f"{filename}-output.metta", "w+") as f:
        f.write(metta)
