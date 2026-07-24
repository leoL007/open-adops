import test from "node:test";
import assert from "node:assert/strict";
import {
  dataQualityChecks,
  dataQualityNeedsAttention,
  dataQualityText
} from "../public/lib/data-quality.js";

test("legacy partial quality data never claims every check is clean", () => {
  const data = {
    availableFields: ["date", "spend", "af_installs"],
    dateQuality: { totalRows: 10, validRows: 10, invalidRows: 0 }
  };
  assert.deepEqual(dataQualityChecks(data), { numeric: "unchecked", date: "checked" });
  assert.equal(dataQualityNeedsAttention(data), true);
  assert.match(dataQualityText(data), /数值未检查/);
  assert.match(dataQualityText(data), /日期未发现异常/);
});

test("complete clean checks stay concise and do not need attention", () => {
  const data = {
    availableFields: ["date", "spend"],
    numericQuality: { checkedFields: 1, invalidCells: 0, blankCells: 0 },
    dateQuality: { totalRows: 10, validRows: 10, invalidRows: 0 }
  };
  assert.equal(dataQualityNeedsAttention(data), false);
  assert.equal(dataQualityText(data), "数值未发现异常；日期未发现异常");
});

test("unmapped dates are distinguished from unchecked dates", () => {
  const data = {
    availableFields: ["spend"],
    numericQuality: { checkedFields: 1, invalidCells: 0, blankCells: 0 }
  };
  assert.deepEqual(dataQualityChecks(data), { numeric: "checked", date: "not-mapped" });
  assert.equal(dataQualityText(data), "数值未发现异常；日期未映射");
});
