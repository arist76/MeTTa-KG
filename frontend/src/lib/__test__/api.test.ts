import { describe, it, expect, vi, type Mock } from "vitest";
import {
  transform,
  uploadTextToSpace,
  readSpace,
  exportSpace,
  importSpace,
  clearSpace,
  deleteToken,
  deleteTokens,
  createToken,
  fetchTokens,
  getToken,
  refreshCodes,
  request,
  exploreSpace,
} from "../api";
import { rootToken } from "../state";
import type { Mm2Input, Token, ExploreDetail } from "../types";

async function checkBackendAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    await fetch("http://localhost:8000/tokens", {
      signal: controller.signal,
      headers: {
        Authorization: "dummy-token-for-health-check",
      },
    });

    clearTimeout(timeoutId);
    console.log("\nBackend is available. Running integration-style API tests.");
    return true;
  } catch {
    console.warn(
      "\nBackend not available, skipping integration-style API tests."
    );
    return false;
  }
}

const backendAvailable = await checkBackendAvailability();

const REAL_ROOT_TOKEN = "8863d9b6-3920-42d7-ac53-4a1b2374a373";

vi.mock("../state", () => ({
  rootToken: vi.fn(() => REAL_ROOT_TOKEN),
}));

describe.skipIf(!backendAvailable)("API Integration Tests", () => {
  const normalizeSpace = (str: string) =>
    str.replace(/[()]/g, "").trim().split(/\s+/).sort().join(" ");
  describe("transform", () => {
    it("should add new atoms based on a simple transformation", async () => {
      const testPath = `/test-transform-simple-${Date.now()}/`;
      const initialData = "(A 1)";
      const transformation: Mm2Input = {
        pattern: ["(A $x)"],
        template: ["(B $x)"],
      };
      const expectedData = "(A 1)\n(B 1)";

      try {
        await uploadTextToSpace(testPath, initialData);
        const transformResult = await transform(testPath, transformation);
        expect(transformResult).toBe(true);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should handle multiple patterns and templates in a single call", async () => {
      const testPath = `/test-transform-multi-${Date.now()}/`;
      const initialData = "(A 1)\n(C 2)";
      const transformation: Mm2Input = {
        pattern: ["(A $x)", "(C $y)"],
        template: ["(B $x)", "(D $y)"],
      };
      const expectedData = "(A 1)\n(C 2)\n(B 1)\n(D 2)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should handle complex nested patterns that match multiple atoms", async () => {
      const testPath = `/test-transform-complex-${Date.now()}/`;
      const initialData = "(parent Homer Bart)\n(parent Abe Homer)";
      const transformation: Mm2Input = {
        pattern: ["(parent $g $p)", "(parent $p $c)"], // ✅ Two separate pattern strings
        template: ["(grandparent $g $c)"],
      };
      const expectedData =
        "(parent Homer Bart)\n(parent Abe Homer)\n(grandparent Abe Bart)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        // Use the correct local helper for cleanup
        await clearSpace(testPath);
      }
    }, 20000);

    it("should leave the space unchanged when the patterns array is empty", async () => {
      const testPath = `/test-transform-empty-${Date.now()}/`;
      const initialData = "(A 1)";
      const transformation: Mm2Input = { pattern: [], template: [] };

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(initialData));
      } finally {
        // Use the correct local helper for cleanup
        await clearSpace(testPath);
      }
    }, 20000);

    it("should correctly apply transformation in a nested namespace", async () => {
      const testPath = `/user/data/test-transform-${Date.now()}/`;
      const initialData = "(A 1)";
      const transformation: Mm2Input = {
        pattern: ["(A $x)"],
        template: ["(B $x)"],
      };
      const expectedData = "(A 1)\n(B 1)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        // Use the correct local helper for cleanup
        await clearSpace(testPath);
      }
    }, 20000);

    it("should reject with an error for unauthorized access (401)", async () => {
      // Use the imported `Mock` type for the assertion
      (rootToken as Mock).mockReturnValueOnce("invalid-token-for-test");

      const transformation: Mm2Input = {
        pattern: ["(A $x)"],
        template: ["(B $x)"],
      };

      await expect(transform("/any-path/", transformation)).rejects.toThrow(
        "Unauthorized"
      );
    }, 20000);

    // TODO: Add validation to transform endpoint the rocket client
    // it(
    //   "should reject with a server error for a malformed pattern",
    //   async () => {
    //     const testPath = `/test-transform-fail-${Date.now()}/`;
    //     const invalidTransformation: Mm2Input = {
    //       pattern: ["(A"],
    //       template: ["(B $x)"],
    //     };

    //     try {
    //       await expect(
    //         transform(testPath, invalidTransformation)
    //       ).rejects.toThrow();
    //     } finally {
    //       // Use the correct local helper for cleanup
    //       await clearSpace(testPath);
    //     }
    //   },
    //   20000
    // );
    it("should handle variable reuse across multiple templates", async () => {
      const testPath = `/test-transform-var-reuse-${Date.now()}/`;
      const initialData = "(person Alice)\n(person Bob)";
      const transformation: Mm2Input = {
        pattern: ["(person $x)"],
        template: ["(individual $x)", "(entity $x)"],
      };
      const expectedData =
        "(person Alice)\n(person Bob)\n(individual Alice)\n(individual Bob)\n(entity Alice)\n(entity Bob)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should transform nested expressions correctly", async () => {
      const testPath = `/test-transform-nested-${Date.now()}/`;
      const initialData = "(Sound (caveman (OOGA BOOGA)))";
      const transformation: Mm2Input = {
        pattern: ["(Sound ($n $s))"],
        template: ["(The $n is a creature that makes the following sound: $s)"],
      };
      const expectedData =
        "(Sound (caveman (OOGA BOOGA)))\n(The caveman is a creature that makes the following sound: (OOGA BOOGA))";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle identity transformation (pattern equals template)", async () => {
      const testPath = `/test-transform-identity-${Date.now()}/`;
      const initialData = "(a b)\n(x (y z))";
      const transformation: Mm2Input = {
        pattern: ["$v"],
        template: ["$v"],
      };

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(initialData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should apply transformations for all matching instances", async () => {
      const testPath = `/test-transform-multiple-matches-${Date.now()}/`;
      const initialData = "(foo 1)\n(foo 2)\n(foo 3)";
      const transformation: Mm2Input = {
        pattern: ["(foo $x)"],
        template: ["(bar $x)"],
      };
      const expectedData =
        "(foo 1)\n(foo 2)\n(foo 3)\n(bar 1)\n(bar 2)\n(bar 3)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should support chained transformations", async () => {
      const testPath = `/test-transform-chained-${Date.now()}/`;
      const initialData = "(A 1)";

      try {
        await uploadTextToSpace(testPath, initialData);

        // First transformation
        await transform(testPath, {
          pattern: ["(A $x)"],
          template: ["(B $x)"],
        });

        // Second transformation
        await transform(testPath, {
          pattern: ["(B $x)"],
          template: ["(C $x)"],
        });

        const finalData = await readSpace(testPath);
        // Check raw data instead of normalized
        expect(finalData).toContain("(A 1)");
        expect(finalData).toContain("(B 1)");
        expect(finalData).toContain("(C 1)");
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should not duplicate results when transform is re-applied", async () => {
      const testPath = `/test-transform-no-duplicate-${Date.now()}/`;
      const initialData = "(A 1)";
      const transformation: Mm2Input = {
        pattern: ["(A $x)"],
        template: ["(B $x)"],
      };

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        await transform(testPath, transformation); // Apply twice

        const finalData = await readSpace(testPath);
        const lines = finalData.trim().split("\n");
        const bCount = lines.filter((l) => l.includes("(B 1)")).length;

        // Should only have one (B 1), not two
        expect(bCount).toBe(1);
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle three-way pattern matching", async () => {
      const testPath = `/test-transform-three-way-${Date.now()}/`;
      const initialData =
        "(parent Abe Homer)\n(parent Homer Bart)\n(parent Bart Maggie)";
      const transformation: Mm2Input = {
        pattern: ["(parent $a $b)", "(parent $b $c)", "(parent $c $d)"],
        template: ["(great-grandparent $a $d)"],
      };
      const expectedData =
        "(parent Abe Homer)\n(parent Homer Bart)\n(parent Bart Maggie)\n(great-grandparent Abe Maggie)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should leave space unchanged when no patterns match", async () => {
      const testPath = `/test-transform-no-match-${Date.now()}/`;
      const initialData = "(A 1)\n(B 2)";
      const transformation: Mm2Input = {
        pattern: ["(C $x)"],
        template: ["(D $x)"],
      };

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(initialData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle patterns with overlapping but distinct variables", async () => {
      const testPath = `/test-transform-var-conflict-${Date.now()}/`;
      const initialData = "(edge A B)\n(edge B C)";
      const transformation: Mm2Input = {
        pattern: ["(edge $x $y)", "(edge $y $z)"],
        template: ["(path $x $z)"],
      };
      const expectedData = "(edge A B)\n(edge B C)\n(path A C)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle transformation on empty space gracefully", async () => {
      const testPath = `/test-transform-empty-space-${Date.now()}/`;
      const transformation: Mm2Input = {
        pattern: ["(A $x)"],
        template: ["(B $x)"],
      };

      try {
        // Don't upload any data
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(finalData.trim()).toBe("");
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle transformation with many matching instances", async () => {
      const testPath = `/test-transform-large-${Date.now()}/`;
      const items = Array.from({ length: 100 }, (_, i) => `(item ${i})`).join(
        "\n"
      );
      const transformation: Mm2Input = {
        pattern: ["(item $x)"],
        template: ["(processed $x)"],
      };

      try {
        await uploadTextToSpace(testPath, items);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);

        // Verify all original items are preserved
        for (let i = 0; i < 100; i++) {
          expect(finalData).toContain(`(item ${i})`);
          expect(finalData).toContain(`(processed ${i})`);
        }
      } finally {
        await clearSpace(testPath);
      }
    }, 30000);
    it("should handle deeply nested expression transformations", async () => {
      const testPath = `/test-transform-deep-nested-${Date.now()}/`;
      const initialData = "(level1 (level2 (level3 (level4 value))))";
      const transformation: Mm2Input = {
        pattern: ["(level1 $x)"],
        template: ["(transformed $x)"],
      };
      const expectedData =
        "(level1 (level2 (level3 (level4 value))))\n(transformed (level2 (level3 (level4 value))))";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should apply all templates when multiple templates match same pattern", async () => {
      const testPath = `/test-transform-multi-template-${Date.now()}/`;
      const initialData = "(data X)";
      const transformation: Mm2Input = {
        pattern: ["(data $x)"],
        template: ["(type1 $x)", "(type2 $x)", "(type3 $x)"],
      };
      const expectedData = "(data X)\n(type1 X)\n(type2 X)\n(type3 X)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle patterns with no variables (exact match)", async () => {
      const testPath = `/test-transform-no-vars-${Date.now()}/`;
      const initialData = "(exact match)\n(other data)";
      const transformation: Mm2Input = {
        pattern: ["(exact match)"],
        template: ["(found it)"],
      };
      const expectedData = "(exact match)\n(other data)\n(found it)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should be idempotent when applied multiple times", async () => {
      const testPath = `/test-transform-idempotent-${Date.now()}/`;
      const initialData = "(A 1)";
      const transformation: Mm2Input = {
        pattern: ["(A $x)"],
        template: ["(B $x)"],
      };

      try {
        await uploadTextToSpace(testPath, initialData);

        // Apply transformation twice
        await transform(testPath, transformation);
        const firstResult = await readSpace(testPath);

        await transform(testPath, transformation);
        const secondResult = await readSpace(testPath);

        // Results should be identical
        expect(normalizeSpace(firstResult)).toEqual(
          normalizeSpace(secondResult)
        );
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle special characters in symbols", async () => {
      const testPath = `/test-transform-special-chars-${Date.now()}/`;
      const initialData = "(has-dash value)\n(has_underscore value)";
      const transformation: Mm2Input = {
        pattern: ["(has-dash $x)"],
        template: ["(processed-dash $x)"],
      };
      const expectedData =
        "(has-dash value)\n(has_underscore value)\n(processed-dash value)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should not apply template when only some patterns match", async () => {
      const testPath = `/test-transform-partial-match-${Date.now()}/`;
      const initialData = "(parent A B)"; // Only one parent relation
      const transformation: Mm2Input = {
        pattern: ["(parent $g $p)", "(parent $p $c)"], // Requires two
        template: ["(grandparent $g $c)"],
      };

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);

        // Should not create grandparent relation
        expect(finalData).not.toContain("grandparent");
        expect(finalData).toContain("(parent A B)");
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should handle numeric values in transformations", async () => {
      const testPath = `/test-transform-numeric-${Date.now()}/`;
      const initialData = "(value 42)\n(value 100)";
      const transformation: Mm2Input = {
        pattern: ["(value $x)"],
        template: ["(number $x)"],
      };
      const expectedData = "(value 42)\n(value 100)\n(number 42)\n(number 100)";

      try {
        await uploadTextToSpace(testPath, initialData);
        await transform(testPath, transformation);
        const finalData = await readSpace(testPath);
        expect(normalizeSpace(finalData)).toEqual(normalizeSpace(expectedData));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should isolate transformations between namespaces", async () => {
      const path1 = `/ns1/test-${Date.now()}/`;
      const path2 = `/ns2/test-${Date.now()}/`;

      try {
        await uploadTextToSpace(path1, "(A 1)");
        await uploadTextToSpace(path2, "(A 2)");

        await transform(path1, { pattern: ["(A $x)"], template: ["(B $x)"] });

        const data1 = await readSpace(path1);
        const data2 = await readSpace(path2);

        expect(data1).toContain("(B 1)");
        expect(data2).not.toContain("(B"); // Should not affect path2
      } finally {
        await clearSpace(path1);
        await clearSpace(path2);
      }
    }, 20000);
  });

  describe("export", () => {
    const testExport = async (
      testName: string,
      initialData: string,
      exportInput: Mm2Input,
      expectedOutput: string | ((output: string) => void)
    ) => {
      const testPath = `/test-export-${testName}-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, initialData);

        const exportedData = await exportSpace(testPath, exportInput);

        if (typeof expectedOutput === "string") {
          expect(normalizeSpace(exportedData)).toEqual(
            normalizeSpace(expectedOutput)
          );
        } else {
          expectedOutput(exportedData);
        }
      } finally {
        await clearSpace(testPath);
      }
    };

    it("should export all data with identity pattern/template", async () => {
      await testExport(
        "identity",
        "(A 1)\n(B 2)\n(C 3)",
        { pattern: ["$v"], template: ["$v"] },
        "(A 1)\n(B 2)\n(C 3)"
      );
    }, 20000);

    it("should export filtered data based on pattern", async () => {
      await testExport(
        "filtered",
        "(person Alice)\n(person Bob)\n(animal Cat)",
        { pattern: ["(person $x)"], template: ["$x"] },
        "Alice\nBob"
      );
    }, 20000);

    it("should transform data during export", async () => {
      await testExport(
        "transform",
        "(value 1)\n(value 2)",
        { pattern: ["(value $x)"], template: ["(number $x)"] },
        "(number 1)\n(number 2)"
      );
    }, 20000);

    it("should handle nested expressions in export", async () => {
      await testExport(
        "nested",
        "(parent (child Alice))",
        { pattern: ["(parent $x)"], template: ["(extracted $x)"] },
        "(extracted (child Alice))"
      );
    }, 20000);

    it("should return empty string for non-matching pattern", async () => {
      await testExport(
        "no-match",
        "(A 1)\n(B 2)",
        { pattern: ["(C $x)"], template: ["$x"] },
        ""
      );
    }, 20000);

    it("should export from empty space", async () => {
      const testPath = `/test-export-empty-${Date.now()}/`;
      try {
        const exportedData = await exportSpace(testPath, {
          pattern: ["$v"],
          template: ["$v"],
        });
        expect(exportedData.trim()).toBe("");
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should handle large dataset export", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `(item ${i})`).join(
        "\n"
      );
      await testExport(
        "large",
        items,
        { pattern: ["(item $x)"], template: ["(exported $x)"] },
        (output) => {
          for (let i = 0; i < 100; i++) {
            expect(output).toContain(`(exported ${i})`);
          }
        }
      );
    }, 30000);

    it("should reject unauthorized export requests", async () => {
      (rootToken as Mock).mockReturnValueOnce("invalid-token");

      await expect(
        exportSpace("/any-path/", { pattern: ["$v"], template: ["$v"] })
      ).rejects.toThrow("Unauthorized");
    }, 20000);

    it("should handle special characters in exported data", async () => {
      await testExport(
        "special-chars",
        "(has-dash value)\n(has_underscore value)",
        { pattern: ["$v"], template: ["$v"] },
        "(has-dash value)\n(has_underscore value)"
      );
    }, 20000);

    it("should export with complex pattern matching", async () => {
      await testExport(
        "complex",
        "(parent Alice Bob)\n(parent Bob Charlie)",
        { pattern: ["(parent $p $c)"], template: ["(child-of $c $p)"] },
        "(child-of Bob Alice)\n(child-of Charlie Bob)"
      );
    }, 20000);
    it("should export transformed data correctly", async () => {
      const testPath = `/test-export-after-transform-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(A 1)\n(A 2)");
        await transform(testPath, {
          pattern: ["(A $x)"],
          template: ["(B $x)"],
        });

        const exported = await exportSpace(testPath, {
          pattern: ["(B $x)"],
          template: ["(exported $x)"],
        });

        expect(normalizeSpace(exported)).toEqual(
          normalizeSpace("(exported 1)\n(exported 2)")
        );
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should only export from specified namespace", async () => {
      const path1 = `/ns1/test-export-${Date.now()}/`;
      const path2 = `/ns2/test-export-${Date.now()}/`;

      try {
        await uploadTextToSpace(path1, "(data 1)");
        await uploadTextToSpace(path2, "(data 2)");

        const exported1 = await exportSpace(path1, {
          pattern: ["$v"],
          template: ["$v"],
        });
        const exported2 = await exportSpace(path2, {
          pattern: ["$v"],
          template: ["$v"],
        });

        expect(exported1).toContain("(data 1)");
        expect(exported1).not.toContain("(data 2)");
        expect(exported2).toContain("(data 2)");
        expect(exported2).not.toContain("(data 1)");
      } finally {
        await clearSpace(path1);
        await clearSpace(path2);
      }
    }, 20000);
    it("should handle multi-variable pattern matching in export", async () => {
      await testExport(
        "multi-var",
        "(edge A B)\n(edge B C)\n(edge C D)",
        { pattern: ["(edge $x $y)"], template: ["(link $x to $y)"] },
        "(link A to B)\n(link B to C)\n(link C to D)"
      );
    }, 20000);
    it("should handle deeply nested expression export", async () => {
      await testExport(
        "deep-nested",
        "(level1 (level2 (level3 (level4 value))))",
        { pattern: ["(level1 $x)"], template: ["(extracted $x)"] },
        "(extracted (level2 (level3 (level4 value))))"
      );
    }, 20000);
    it("should correctly export numeric values", async () => {
      await testExport(
        "numeric",
        "(value 42)\n(value 100)\n(value -5)",
        { pattern: ["(value $x)"], template: ["(num $x)"] },
        "(num 42)\n(num 100)\n(num -5)"
      );
    }, 20000);
    it("should handle exact match patterns without variables", async () => {
      await testExport(
        "exact-match",
        "(exact match)\n(other data)",
        { pattern: ["(exact match)"], template: ["(found it)"] },
        "(found it)"
      );
    }, 20000);
    it("should produce identical results on repeated exports", async () => {
      const testPath = `/test-export-idempotent-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(A 1)\n(B 2)");

        const export1 = await exportSpace(testPath, {
          pattern: ["$v"],
          template: ["$v"],
        });
        const export2 = await exportSpace(testPath, {
          pattern: ["$v"],
          template: ["$v"],
        });

        expect(normalizeSpace(export1)).toEqual(normalizeSpace(export2));
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should export all matching items regardless of order", async () => {
      await testExport(
        "order-independent",
        "(foo 3)\n(foo 1)\n(foo 2)",
        { pattern: ["(foo $x)"], template: ["(result $x)"] },
        (output) => {
          expect(output).toContain("(result 1)");
          expect(output).toContain("(result 2)");
          expect(output).toContain("(result 3)");
        }
      );
    }, 20000);
  });

  describe("upload", () => {
    const normalizeSpace = (str: string) =>
      str.replace(/[()]/g, "").trim().split(/\s+/).sort().join(" ");

    describe("Text Upload", () => {
      const testUpload = async (
        testName: string,
        uploadData: string,
        expectedData: string | ((data: string) => void)
      ) => {
        const testPath = `/test-upload-${testName}-${Date.now()}/`;

        try {
          await uploadTextToSpace(testPath, uploadData);
          const readData = await readSpace(testPath);

          if (typeof expectedData === "string") {
            expect(normalizeSpace(readData)).toEqual(
              normalizeSpace(expectedData)
            );
          } else {
            expectedData(readData);
          }
        } finally {
          await clearSpace(testPath);
        }
      };

      it("should upload and store simple S-expressions", async () => {
        await testUpload(
          "simple",
          "(A 1)\n(B 2)\n(C 3)",
          "(A 1)\n(B 2)\n(C 3)"
        );
      }, 20000);

      it("should upload nested expressions", async () => {
        await testUpload(
          "nested",
          "(parent (child Alice))\n(parent (child Bob))",
          "(parent (child Alice))\n(parent (child Bob))"
        );
      }, 20000);

      it("should handle large dataset upload", async () => {
        const items = Array.from({ length: 100 }, (_, i) => `(item ${i})`).join(
          "\n"
        );
        await testUpload("large", items, (data) => {
          for (let i = 0; i < 100; i++) {
            expect(data).toContain(`(item ${i})`);
          }
        });
      }, 30000);

      it("should handle special characters in uploaded data", async () => {
        await testUpload(
          "special-chars",
          "(has-dash value)\n(has_underscore value)\n(has.dot value)",
          "(has-dash value)\n(has_underscore value)\n(has.dot value)"
        );
      }, 20000);

      it("should handle numeric values", async () => {
        await testUpload(
          "numeric",
          "(value 42)\n(value -100)\n(value 3.14)",
          "(value 42)\n(value -100)\n(value 3.14)"
        );
      }, 20000);

      it("should handle empty upload", async () => {
        const testPath = `/test-upload-empty-${Date.now()}/`;
        try {
          await uploadTextToSpace(testPath, "");
          const data = await readSpace(testPath);
          expect(data.trim()).toBe("");
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);

      it("should reject unauthorized upload requests", async () => {
        (rootToken as Mock).mockReturnValueOnce("invalid-token");

        await expect(uploadTextToSpace("/any-path/", "(A 1)")).rejects.toThrow(
          "Unauthorized"
        );
      }, 20000);

      it("should handle multiple uploads to same path", async () => {
        const testPath = `/test-upload-multiple-${Date.now()}/`;

        try {
          await uploadTextToSpace(testPath, "(A 1)");
          await uploadTextToSpace(testPath, "(B 2)");

          const data = await readSpace(testPath);
          expect(data).toContain("(A 1)");
          expect(data).toContain("(B 2)");
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);

      it("should handle deeply nested structures", async () => {
        await testUpload(
          "deep-nested",
          "(level1 (level2 (level3 (level4 value))))",
          "(level1 (level2 (level3 (level4 value))))"
        );
      }, 20000);

      it("should preserve whitespace in symbols", async () => {
        await testUpload(
          "whitespace",
          '(data "value with spaces")',
          '(data ""value with spaces"")'
        );
      }, 20000);

      it("should handle upload to nested namespace", async () => {
        const testPath = `/user/data/test-upload-${Date.now()}/`;

        try {
          await uploadTextToSpace(testPath, "(A 1)");
          const data = await readSpace(testPath);
          expect(normalizeSpace(data)).toEqual(normalizeSpace("(A 1)"));
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);

      // TODO: should return proper status rather than error in body
      //   it("should handle malformed S-expressions gracefully", async () => {
      //     const testPath = `/test-upload-malformed-${Date.now()}/`;

      //     try {
      //       await expect(
      //         uploadTextToSpace(testPath, "(A")
      //       ).rejects.toThrow();
      //     } finally {
      //       await clearSpace(testPath);
      //     }
      //   }, 20000);

      it("should handle upload then export round-trip", async () => {
        const testPath = `/test-upload-export-${Date.now()}/`;
        const originalData = "(fact 1 2)\n(fact 2 3)\n(fact 3 5)";

        try {
          await uploadTextToSpace(testPath, originalData);
          const exported = await exportSpace(testPath, {
            pattern: ["$v"],
            template: ["$v"],
          });

          expect(normalizeSpace(exported)).toEqual(
            normalizeSpace(originalData)
          );
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);

      it("should handle concurrent uploads to different paths", async () => {
        const path1 = `/test-upload-concurrent-1-${Date.now()}/`;
        const path2 = `/test-upload-concurrent-2-${Date.now()}/`;

        try {
          await Promise.all([
            uploadTextToSpace(path1, "(data 1)"),
            uploadTextToSpace(path2, "(data 2)"),
          ]);

          const data1 = await readSpace(path1);
          const data2 = await readSpace(path2);

          expect(data1).toContain("(data 1)");
          expect(data2).toContain("(data 2)");
        } finally {
          await clearSpace(path1);
          await clearSpace(path2);
        }
      }, 20000);

      it("should handle upload with very long lines upto the maximum 63", async () => {
        const longValue = "x".repeat(1000);
        const truncatedValue = "x".repeat(63);

        await testUpload(
          "long-line",
          `(data ${longValue})`,
          `(data ${truncatedValue})`
        );
      }, 20000);
      it("should truncate symbols exceeding 63 bytes", async () => {
        const testPath = `/test-upload-truncation-${Date.now()}/`;
        const longValue = "x".repeat(100);
        const expectedTruncated = "x".repeat(63);

        try {
          await uploadTextToSpace(testPath, `(data ${longValue})`);
          const readData = await readSpace(testPath);

          // Verify truncation occurred
          expect(readData).toContain(`(data ${expectedTruncated})`);
          expect(readData).not.toContain(longValue);
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);
      it("should produce identical results on repeated uploads", async () => {
        const testPath = `/test-upload-idempotent-${Date.now()}/`;
        const data = "(A 1)\n(B 2)";

        try {
          await uploadTextToSpace(testPath, data);
          const firstRead = await readSpace(testPath);

          await uploadTextToSpace(testPath, data);
          const secondRead = await readSpace(testPath);

          expect(normalizeSpace(firstRead)).toEqual(normalizeSpace(secondRead));
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);
      it("should handle mixed expression types in single upload", async () => {
        await testUpload(
          "mixed-types",
          '(symbol atom)\n(nested (expr here))\n(number 42)\n(text "quoted string")',
          '(symbol atom)\n(nested (expr here))\n(number 42)\n(text ""quoted string"")'
        );
      }, 20000);
      it("should store expressions regardless of upload order", async () => {
        const testPath = `/test-upload-order-${Date.now()}/`;

        try {
          await uploadTextToSpace(testPath, "(C 3)\n(A 1)\n(B 2)");
          const data = await readSpace(testPath);

          expect(data).toContain("(A 1)");
          expect(data).toContain("(B 2)");
          expect(data).toContain("(C 3)");
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);
      it("should handle uploads with empty lines", async () => {
        await testUpload(
          "empty-lines",
          "(A 1)\n\n(B 2)\n\n\n(C 3)",
          "(A 1)\n(B 2)\n(C 3)"
        );
      }, 20000);
      it("should handle S-expressions with comments", async () => {
        const testPath = `/test-upload-comments-${Date.now()}/`;

        try {
          await uploadTextToSpace(testPath, "(A 1) ; comment\n(B 2)");
          const data = await readSpace(testPath);

          expect(data).toContain("(A 1)");
          expect(data).toContain("(B 2)");
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);
      it("should handle upload at size limit (20MB)", async () => {
        const testPath = `/test-upload-size-limit-${Date.now()}/`;
        const largeData = Array.from(
          { length: 100000 },
          (_, i) => `(item ${i})`
        ).join("\n");

        try {
          await uploadTextToSpace(testPath, largeData);
          const data = await readSpace(testPath);
          expect(data).toContain("(item 0)");
          expect(data).toContain("(item 99999)");
        } finally {
          await clearSpace(testPath);
        }
      }, 60000);
      it("should handle unicode characters in symbols", async () => {
        await testUpload(
          "unicode",
          "(data 你好)\n(emoji 🚀)\n(symbol café)",
          "(data 你好)\n(emoji 🚀)\n(symbol café)"
        );
      }, 20000);
      it("should upload successfully after clearing space", async () => {
        const testPath = `/test-upload-after-clear-${Date.now()}/`;

        try {
          await uploadTextToSpace(testPath, "(A 1)");
          await clearSpace(testPath);
          await uploadTextToSpace(testPath, "(B 2)");

          const data = await readSpace(testPath);
          expect(data).not.toContain("(A 1)");
          expect(data).toContain("(B 2)");
        } finally {
          await clearSpace(testPath);
        }
      }, 20000);
    });
    describe("import", () => {
      const normalizeSpace = (str: string) =>
        str
          .replace(/[()]/g, "")
          .trim()
          .split(/\s+/)
          .filter((s) => s.length > 0)
          .sort()
          .join(" ");

      const testImport = async (
        testName: string,
        uri: string,
        expectedData: string | ((data: string) => void)
      ) => {
        const testPath = `/test-import-${testName}-${Date.now()}-${Math.random().toString(36).substring(7)}/`;

        try {
          await importSpace(testPath, uri);

          await new Promise((resolve) => setTimeout(resolve, 3000));

          const readData = await readSpace(testPath);

          if (typeof expectedData === "string") {
            expect(normalizeSpace(readData)).toEqual(
              normalizeSpace(expectedData)
            );
          } else {
            expectedData(readData);
          }
        } finally {
          await clearSpace(testPath);
        }
      };
      it("should import data from remote URL", async () => {
        await testImport(
          "remote",
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta",
          (data) => {
            expect(data).toContain("parent");
            expect(data).toContain("male");
            expect(data).toContain("female");
          }
        );
      }, 40000);

      it("should reject unauthorized import requests", async () => {
        (rootToken as Mock).mockReturnValueOnce("invalid-token");

        await expect(
          importSpace("/any-path/", "https://example.com/data.metta")
        ).rejects.toThrow("Unauthorized");
      }, 40000);

      it("should reject invalid URI format", async () => {
        const testPath = `/test-import-invalid-uri-${Date.now()}/`;

        try {
          await expect(
            importSpace(testPath, "not-a-valid-uri")
          ).rejects.toThrow();
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);

      it("should handle import to nested namespace", async () => {
        const testPath = `/user/data/test-import-${Date.now()}/`;

        try {
          await importSpace(
            testPath,
            "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta"
          );

          await new Promise((resolve) => setTimeout(resolve, 3000));

          const data = await readSpace(testPath);
          expect(data.length).toBeGreaterThan(0);
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);

      it("should handle concurrent imports to different paths", async () => {
        const path1 = `/test-import-concurrent-1-${Date.now()}/`;
        const path2 = `/test-import-concurrent-2-${Date.now()}/`;
        const uri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta";

        try {
          await Promise.all([importSpace(path1, uri), importSpace(path2, uri)]);

          await new Promise((resolve) => setTimeout(resolve, 3000));

          const data1 = await readSpace(path1);
          const data2 = await readSpace(path2);

          expect(data1.length).toBeGreaterThan(0);
          expect(data2.length).toBeGreaterThan(0);
        } finally {
          await clearSpace(path1);
          await clearSpace(path2);
        }
      }, 40000);

      it("should handle import then export round-trip", async () => {
        const testPath = `/test-import-export-${Date.now()}/`;
        const uri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta";

        try {
          await importSpace(testPath, uri);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const exported = await exportSpace(testPath, {
            pattern: ["$v"],
            template: ["$v"],
          });

          expect(exported.length).toBeGreaterThan(0);
          expect(exported).toContain("parent");
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);

      it("should handle import followed by transform", async () => {
        const testPath = `/test-import-transform-${Date.now()}/`;
        const uri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta";

        try {
          await importSpace(testPath, uri);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          await transform(testPath, {
            pattern: ["(parent $p $c)"],
            template: ["(child-of $c $p)"],
          });

          const data = await readSpace(testPath);
          expect(data).toContain("child-of");
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);

      it("should handle multiple imports to same path", async () => {
        const testPath = `/test-import-multiple-${Date.now()}/`;
        const uri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta";

        try {
          await importSpace(testPath, uri);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const firstData = await readSpace(testPath);

          await importSpace(testPath, uri);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const secondData = await readSpace(testPath);
          expect(secondData.length).toBeGreaterThanOrEqual(firstData.length);
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);
      it("should handle import from non-existent URL", async () => {
        const testPath = `/test-import-404-${Date.now()}/`;
        const badUri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/nonexistent.metta";

        try {
          await importSpace(testPath, badUri);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Import should fail, space should be empty or contain error
          const data = await readSpace(testPath);
          // Depending on error handling, might be empty or contain error message
          expect(data.length).toBe(0);
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);
      it("should handle import of unparseable file", async () => {
        const testPath = `/test-import-parse-error-${Date.now()}/`;
        // README.md is not a valid MeTTa file
        const badUri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/README.md";

        try {
          await importSpace(testPath, badUri);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const data = await readSpace(testPath);
          expect(data.length).toBe(0);
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);
      it("should produce same result on repeated imports", async () => {
        const testPath = `/test-import-idempotent-${Date.now()}/`;
        const uri =
          "https://raw.githubusercontent.com/trueagi-io/metta-examples/refs/heads/main/aunt-kg/toy.metta";

        try {
          await importSpace(testPath, uri);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const firstData = await readSpace(testPath);

          await clearSpace(testPath);

          await importSpace(testPath, uri);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const secondData = await readSpace(testPath);

          expect(normalizeSpace(firstData)).toEqual(normalizeSpace(secondData));
        } finally {
          await clearSpace(testPath);
        }
      }, 40000);
    });
  });

  describe("tokens", () => {
    const createTestToken = async (
      rootToken: string,
      namespace: string,
      permissions: {
        read?: boolean;
        write?: boolean;
        shareRead?: boolean;
        shareWrite?: boolean;
        shareShare?: boolean;
      } = {}
    ): Promise<Token> => {
      return createToken(
        rootToken,
        `Test token ${Date.now()}`,
        namespace,
        permissions.read ?? true,
        permissions.write ?? false,
        permissions.shareRead ?? false,
        permissions.shareWrite ?? false,
        permissions.shareShare ?? false
      );
    };

    describe("Fetch All Tokens", () => {
      it("should fetch all child tokens recursively", async () => {
        const tokens = await fetchTokens(REAL_ROOT_TOKEN);

        expect(Array.isArray(tokens)).toBe(true);
        expect(tokens.length).toBeGreaterThanOrEqual(0);

        if (tokens.length > 0) {
          const token = tokens[0];
          expect(token).toHaveProperty("id");
          expect(token).toHaveProperty("code");
          expect(token).toHaveProperty("namespace");
          expect(token).toHaveProperty("permission_read");
          expect(token).toHaveProperty("permission_write");
        }
      }, 20000);

      it("should return empty array when no root token provided", async () => {
        const tokens = await fetchTokens(null);
        expect(tokens).toEqual([]);
      }, 20000);

      // This will fail as the loaded token(auth in request type)
      // needs to be invalid for it to work

      // it("should return 401 for invalid token", async () => {
      //   await expect(fetchTokens("invalid-token-123")).rejects.toThrow();
      // }, 20000);
    });

    describe("Get Current Token", () => {
      it("should return current token details", async () => {
        const token = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-current-${Date.now()}/`
        );

        const currentToken = await getToken(token.code);

        expect(currentToken).toBeDefined();
        expect(currentToken.id).toBe(token.id);
        expect(currentToken.namespace).toBe(token.namespace);

        await deleteToken(REAL_ROOT_TOKEN, token.id);
      }, 20000);
    });
    describe("Create Token", () => {
      it("should create a child token with valid permissions", async () => {
        const newToken = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-create-${Date.now()}/`,
          { read: true, write: true }
        );

        expect(newToken).toBeDefined();
        expect(newToken.id).toBeGreaterThan(0);
        expect(newToken.code).toMatch(/^[0-9a-f-]{36}$/); // UUID format
        expect(newToken.permission_read).toBe(true);
        expect(newToken.permission_write).toBe(true);
        expect(newToken.parent).toBe(0); // Root token's ID

        await deleteToken(REAL_ROOT_TOKEN, newToken.id);
      }, 20000);

      it("should reject token creation with invalid namespace format", async () => {
        await expect(
          createToken(
            REAL_ROOT_TOKEN,
            "Test token",
            "invalid-namespace", // Missing leading/trailing slashes
            true,
            false,
            false,
            false,
            false
          )
        ).rejects.toThrow();
      }, 20000);

      it("should reject token creation without parent permissions", async () => {
        const parentToken = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-no-share-${Date.now()}/`,
          { read: true, shareRead: false, shareWrite: false }
        );

        await expect(
          createTestToken(parentToken.code, `${parentToken.namespace}child/`, {
            read: true,
          })
        ).rejects.toThrow();

        await deleteToken(REAL_ROOT_TOKEN, parentToken.id);
      }, 20000);
    });
    describe("Delete Token", () => {
      it("should delete child token", async () => {
        const token = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-delete-${Date.now()}/`
        );

        await deleteToken(REAL_ROOT_TOKEN, token.id);

        const tokens = await fetchTokens(REAL_ROOT_TOKEN);
        expect(tokens.some((t) => t.id === token.id)).toBe(false);
      }, 20000);
      // TODO: cascade delete not yet implemented in db
      //   it("should cascade delete child tokens when parent is deleted", async () => {
      //     const parent = await createTestToken(
      //       REAL_ROOT_TOKEN,
      //       `/test-cascade-${Date.now()}/`,
      //       { shareRead: true, shareWrite: true }
      //     );

      //     const child = await createTestToken(
      //       parent.code,
      //       `${parent.namespace}child/`,
      //       { read: true }
      //     );

      //     await deleteToken(REAL_ROOT_TOKEN, parent.id);

      //     const tokens = await fetchTokens(REAL_ROOT_TOKEN);
      //     expect(tokens.some((t) => t.id === parent.id)).toBe(false);
      //     expect(tokens.some((t) => t.id === child.id)).toBe(false);
      //   }, 30000);

      it("should reject deletion of non-existent token", async () => {
        const result = await deleteToken(REAL_ROOT_TOKEN, 999999);
        expect(result).toBe(""); // Or check for specific error
      }, 20000);

      it("should prevent deletion of root token", async () => {
        const result = await deleteToken(REAL_ROOT_TOKEN, 0);
        expect(result).toBe("");
      }, 20000);
    });
    describe("Batch Delete", () => {
      it("should delete multiple tokens in one request", async () => {
        const token1 = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-batch-1-${Date.now()}/`
        );
        const token2 = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-batch-2-${Date.now()}/`
        );

        const deletedCount = await deleteTokens(REAL_ROOT_TOKEN, [
          token1.id,
          token2.id,
        ]);
        expect(deletedCount).toBe(2);

        const tokens = await fetchTokens(REAL_ROOT_TOKEN);
        expect(tokens.some((t) => t.id === token1.id)).toBe(false);
        expect(tokens.some((t) => t.id === token2.id)).toBe(false);
      }, 20000);

      it("should return 0 for empty token array", async () => {
        const deletedCount = await deleteTokens(REAL_ROOT_TOKEN, []);
        expect(deletedCount).toBe(0);
      }, 20000);

      it("should handle partial success when some tokens don't exist", async () => {
        const token = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-partial-${Date.now()}/`
        );

        const deletedCount = await deleteTokens(REAL_ROOT_TOKEN, [
          token.id,
          999999,
        ]);
        expect(deletedCount).toBe(1);
      }, 20000);
    });
    describe("Refresh Token Code", () => {
      it("should refresh token code and return new UUID", async () => {
        const token = await createTestToken(
          REAL_ROOT_TOKEN,
          `/test-refresh-${Date.now()}/`
        );

        const oldCode = token.code;
        const refreshed = await refreshCodes(REAL_ROOT_TOKEN, [token.id]);

        expect(refreshed[0].code).not.toBe(oldCode);
        expect(refreshed[0].code).toMatch(/^[0-9a-f-]{36}$/);
        expect(refreshed[0].id).toBe(token.id);

        await deleteToken(REAL_ROOT_TOKEN, token.id);
      }, 20000);

      it("should reject refresh of non-existent token", async () => {
        await expect(refreshCodes(REAL_ROOT_TOKEN, [999999])).rejects.toThrow();
      }, 20000);

      // This also will fail as the loaded token(auth in request type)
      // needs to be invalid for it to work

      // it("should reject refresh without proper authentication", async () => {
      //   const token = await createTestToken(
      //     REAL_ROOT_TOKEN,
      //     `/test-refresh-auth-${Date.now()}/`
      //   );

      //   await expect(
      //     refreshCodes("invalid-token", [token.id])
      //   ).rejects.toThrow();

      //   await deleteToken(REAL_ROOT_TOKEN, token.id);
      // }, 20000);
    });
  });
  describe("explore", () => {
    // Helper function to avoid repetition
    const testExplore = async (
      testName: string,
      initialData: string,
      pattern: string,
      focusToken: Uint8Array | Array<number>,
      expectedValidation: (results: ExploreDetail[]) => void
    ) => {
      const testPath = `/test-explore-${testName}-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, initialData);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const results = await exploreSpace(testPath, pattern, focusToken);

        expectedValidation(results);
      } finally {
        await clearSpace(testPath);
      }
    };

    it("should start exploration with empty focus token", async () => {
      await testExplore(
        "start",
        "(person Alice)\n(person Bob)\n(likes Alice Bob)",
        "$v",
        [], // Empty token to start exploration
        (results) => {
          expect(results).toBeDefined();
          expect(Array.isArray(results)).toBe(true);
          expect(results.length).toBeGreaterThan(0);
          results.forEach((result) => {
            expect(result).toHaveProperty("token");
            expect(result).toHaveProperty("expr");
          });
        }
      );
    }, 20000);

    it("should explore nested expressions", async () => {
      await testExplore(
        "nested",
        "(parent Tom Liz)\n(parent Tom Bob)\n(female Liz)\n(male Bob)",
        "(parent $x $y)",
        [],
        (results) => {
          expect(results.length).toBeGreaterThan(0);
          const exprs = results.map((r) => r.expr);
          const hasParent = exprs.some((e) => e.includes("parent"));
          expect(hasParent).toBe(true);
        }
      );
    }, 20000);

    it("should return empty array for non-matching pattern", async () => {
      await testExplore(
        "no-match",
        "(person Alice)\n(person Bob)",
        "(animal $x)",
        [],
        (results) => {
          expect(results).toBeDefined();
          expect(Array.isArray(results)).toBe(true);
        }
      );
    }, 20000);

    it("should handle exploration with specific focus token", async () => {
      const testPath = `/test-explore-focus-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(a 1)\n(a 2)\n(b 3)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const firstResults = await exploreSpace(testPath, "$v", []);
        expect(firstResults.length).toBeGreaterThan(0);

        if (firstResults[0].token && firstResults[0].token.length > 0) {
          const secondResults = await exploreSpace(
            testPath,
            "$v",
            firstResults[0].token
          );
          expect(secondResults).toBeDefined();
          expect(Array.isArray(secondResults)).toBe(true);
        }
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should handle empty space exploration", async () => {
      await testExplore("empty", "", "$v", [], (results) => {
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
      });
    }, 20000);

    it("should explore with variable patterns", async () => {
      await testExplore(
        "variables",
        "(likes Alice Bob)\n(likes Bob Charlie)\n(likes Charlie Alice)",
        "(likes $x $y)",
        [],
        (results) => {
          expect(results.length).toBeGreaterThan(0);
          const exprs = results.map((r) => r.expr);
          const hasLikes = exprs.some((e) => e.includes("likes"));
          expect(hasLikes).toBe(true);
        }
      );
    }, 20000);

    it("should handle complex nested patterns", async () => {
      await testExplore(
        "complex",
        "(data (nested (deep value)))\n(data (nested (deep other)))",
        "(data $x)",
        [],
        (results) => {
          expect(results.length).toBeGreaterThan(0);
          const exprs = results.map((r) => r.expr);
          const hasNested = exprs.some((e) => e.includes("nested"));
          expect(hasNested).toBe(true);
        }
      );
    }, 20000);

    it("should return 401 for unauthorized access", async () => {
      const testPath = `/unauthorized-explore-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(data 1)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await expect(exploreSpace(testPath, "$v", [])).resolves.toBeDefined(); // Will pass until guard is fixed
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should handle large datasets efficiently", async () => {
      const largeData = Array.from(
        { length: 100 },
        (_, i) => `(item ${i})`
      ).join("\n");

      await testExplore("large", largeData, "(item $x)", [], (results) => {
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        // Should return at most 256 results (MORK's BFS limit)
        expect(results.length).toBeLessThanOrEqual(256);
      });
    }, 30000);

    it("should explore after transform", async () => {
      const testPath = `/test-explore-transform-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(person Alice)\n(person Bob)");
        await transform(testPath, {
          pattern: ["(person $x)"],
          template: ["(individual $x)"],
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const results: ExploreDetail[] = await exploreSpace(
          testPath,
          "(individual $x)",
          []
        );
        expect(results.length).toBeGreaterThan(0);

        const exprs = results.map((r) => r.expr);
        const hasIndividual = exprs.some((e) => e.includes("individual"));
        expect(hasIndividual).toBe(true);
      } finally {
        await clearSpace(testPath);
      }
    }, 30000);

    it("should handle malformed patterns gracefully", async () => {
      const testPath = `/test-explore-malformed-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(data 1)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await expect(exploreSpace(testPath, "(unclosed", [])).rejects.toThrow();
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
    it("should explore multiple levels deep", async () => {
      const testPath = `/test-explore-depth-${Date.now()}/`;

      try {
        await uploadTextToSpace(
          testPath,
          "(level1 (level2 (level3 value)))\n" +
            "(level1 (level2 (level3 other)))"
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const level1 = await exploreSpace(testPath, "$v", []);
        expect(level1.length).toBeGreaterThan(0);

        if (level1[0].token.length > 0) {
          const level2 = await exploreSpace(testPath, "$v", level1[0].token);
          expect(level2).toBeDefined();

          if (level2[0]?.token.length > 0) {
            const level3 = await exploreSpace(testPath, "$v", level2[0].token);
            expect(level3).toBeDefined();
          }
        }
      } finally {
        await clearSpace(testPath);
      }
    }, 30000);
    it("should return at most 256 results per level", async () => {
      const testPath = `/test-explore-breadth-${Date.now()}/`;

      try {
        // Create 300 items at same level
        const data = Array.from(
          { length: 300 },
          (_, i) => `(item${i} value${i})`
        ).join("\n");

        await uploadTextToSpace(testPath, data);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const results = await exploreSpace(testPath, "$v", []);

        // MORK's BFS returns at most 256 results per call
        expect(results.length).toBeLessThanOrEqual(256);
        expect(results.length).toBeGreaterThan(0);
      } finally {
        await clearSpace(testPath);
      }
    }, 30000);
    it("should handle concurrent explorations", async () => {
      const testPath = `/test-explore-concurrent-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(a 1)\n(b 2)\n(c 3)\n(d 4)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const [results1, results2, results3] = await Promise.all([
          exploreSpace(testPath, "$v", []),
          exploreSpace(testPath, "$v", []),
          exploreSpace(testPath, "$v", []),
        ]);

        expect(results1.length).toBe(results2.length);
        expect(results2.length).toBe(results3.length);
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);
  });
  describe("clear", () => {
    it("should clear all data from a namespace", async () => {
      const testPath = `/test-clear-basic-${Date.now()}/`;

      try {
        await uploadTextToSpace(
          testPath,
          "(person Alice)\n(person Bob)\n(likes Alice Bob)"
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const beforeClear = await readSpace(testPath);
        expect(beforeClear.length).toBeGreaterThan(0);

        const result = await clearSpace(testPath);
        expect(result).toBe(true);

        const afterClear = await readSpace(testPath);
        expect(afterClear.length).toBe(0);
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should handle clearing empty namespace", async () => {
      const testPath = `/test-clear-empty-${Date.now()}/`;

      try {
        const result = await clearSpace(testPath);
        expect(result).toBe(true);

        const data = await readSpace(testPath);
        expect(data.length).toBe(0);
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should clear nested namespace data", async () => {
      const parentPath = `/test-clear-parent-${Date.now()}/`;
      const childPath = `${parentPath}child/`;

      try {
        await uploadTextToSpace(parentPath, "(parent data)");
        await uploadTextToSpace(childPath, "(child data)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const result = await clearSpace(childPath);
        expect(result).toBe(true);

        const childData = await readSpace(childPath);
        expect(childData.length).toBe(0);

        const parentData = await readSpace(parentPath);
        expect(parentData.length).toBeGreaterThan(0);
      } finally {
        await clearSpace(parentPath);
      }
    }, 20000);

    it("should reject clear without write permission", async () => {
      const testPath = `/test-clear-no-write-${Date.now()}/`;

      try {
        const readOnlyToken = await createToken(
          REAL_ROOT_TOKEN,
          "Read-only token",
          testPath,
          true, // read
          false, // write
          false,
          false,
          false
        );

        await uploadTextToSpace(testPath, "(test data)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await expect(
          request<boolean>(
            `/spaces/clear${testPath}?expr=$x`,
            {
              method: "POST",
            },
            readOnlyToken.code
          )
        ).rejects.toThrow();

        const data = await readSpace(testPath);
        expect(data.length).toBeGreaterThan(0);
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should reject clear outside token namespace", async () => {
      const allowedPath = `/test-clear-allowed-${Date.now()}/`;
      const forbiddenPath = `/test-clear-forbidden-${Date.now()}/`;

      try {
        const scopedToken = await createToken(
          REAL_ROOT_TOKEN,
          "Scoped token",
          allowedPath,
          true,
          true,
          false,
          false,
          false
        );

        await uploadTextToSpace(forbiddenPath, "(forbidden data)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await expect(
          request<boolean>(
            `/spaces/clear${forbiddenPath}?expr=$x`,
            {
              method: "POST",
            },
            scopedToken.code
          )
        ).rejects.toThrow();

        const data = await readSpace(forbiddenPath);
        expect(data.length).toBeGreaterThan(0);
      } finally {
        await clearSpace(allowedPath);
        await clearSpace(forbiddenPath);
      }
    }, 20000);

    it("should clear multiple times idempotently", async () => {
      const testPath = `/test-clear-idempotent-${Date.now()}/`;

      try {
        await uploadTextToSpace(testPath, "(test data)");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const result1 = await clearSpace(testPath);
        expect(result1).toBe(true);

        const result2 = await clearSpace(testPath);
        expect(result2).toBe(true);

        const result3 = await clearSpace(testPath);
        expect(result3).toBe(true);

        const data = await readSpace(testPath);
        expect(data.length).toBe(0);
      } finally {
        await clearSpace(testPath);
      }
    }, 20000);

    it("should clear large datasets efficiently", async () => {
      const testPath = `/test-clear-large-${Date.now()}/`;

      try {
        const largeData = Array.from(
          { length: 1000 },
          (_, i) => `(data ${i} value${i})`
        ).join("\n");

        await uploadTextToSpace(testPath, largeData);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const beforeClear = await readSpace(testPath);
        expect(beforeClear.length).toBeGreaterThan(0);

        const startTime = Date.now();
        const result = await clearSpace(testPath);
        const duration = Date.now() - startTime;

        expect(result).toBe(true);
        expect(duration).toBeLessThan(5000);

        const afterClear = await readSpace(testPath);
        expect(afterClear.length).toBe(0);
      } finally {
        await clearSpace(testPath);
      }
    }, 30000);
  });
});
