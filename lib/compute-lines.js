"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const diff = require("diff");
const jsDiff = diff;
var DiffType;
(function (DiffType) {
    DiffType[DiffType["DEFAULT"] = 0] = "DEFAULT";
    DiffType[DiffType["ADDED"] = 1] = "ADDED";
    DiffType[DiffType["REMOVED"] = 2] = "REMOVED";
})(DiffType = exports.DiffType || (exports.DiffType = {}));
// See https://github.com/kpdecker/jsdiff/tree/v4.0.1#api for more info on the below JsDiff methods
var DiffMethod;
(function (DiffMethod) {
    DiffMethod["CHARS"] = "diffChars";
    DiffMethod["WORDS"] = "diffWords";
    DiffMethod["WORDS_WITH_SPACE"] = "diffWordsWithSpace";
    DiffMethod["LINES"] = "diffLines";
    DiffMethod["TRIMMED_LINES"] = "diffTrimmedLines";
    DiffMethod["SENTENCES"] = "diffSentences";
    DiffMethod["CSS"] = "diffCss";
})(DiffMethod = exports.DiffMethod || (exports.DiffMethod = {}));
/**
 * Splits diff text by new line and computes final list of diff lines based on
 * conditions.
 *
 * @param value Diff text from the js diff module.
 */
const constructLines = (value) => {
    const lines = value.split('\n');
    const isAllEmpty = lines.every((val) => !val);
    if (isAllEmpty) {
        // This is to avoid added an extra new line in the UI.
        if (lines.length === 2) {
            return [];
        }
        lines.pop();
        return lines;
    }
    const lastLine = lines[lines.length - 1];
    const firstLine = lines[0];
    // Remove the first and last element if they are new line character. This is
    // to avoid addition of extra new line in the UI.
    if (!lastLine) {
        lines.pop();
    }
    if (!firstLine) {
        lines.shift();
    }
    return lines;
};
/**
 * Computes word diff information in the line.
 * [TODO]: Consider adding options argument for JsDiff text block comparison
 *
 * @param oldValue Old word in the line.
 * @param newValue New word in the line.
 * @param compareMethod JsDiff text diff method from https://github.com/kpdecker/jsdiff/tree/v4.0.1#api
 */
const computeDiff = (oldValue, newValue, compareMethod = DiffMethod.CHARS, didNotError) => {
    const diffArray = jsDiff[compareMethod](oldValue, newValue);
    const computedDiff = {
        left: [],
        right: [],
    };
    diffArray
        .forEach(({ added, removed, value }) => {
        const diffInformation = {};
        if (added) {
            if (didNotError) {
                diffInformation.type = DiffType.ADDED;
            }
            else {
                diffInformation.type = DiffType.REMOVED;
            }
            diffInformation.value = value;
            computedDiff.right.push(diffInformation);
        }
        if (removed) {
            if (didNotError) {
                diffInformation.type = DiffType.ADDED;
            }
            else {
                diffInformation.type = DiffType.REMOVED;
            }
            diffInformation.value = value;
            computedDiff.left.push(diffInformation);
        }
        if (!removed && !added) {
            diffInformation.type = DiffType.DEFAULT;
            diffInformation.value = value;
            computedDiff.right.push(diffInformation);
            computedDiff.left.push(diffInformation);
        }
        return diffInformation;
    });
    return computedDiff;
};
/**
 * [TODO]: Think about moving common left and right value assignment to a
 * common place. Better readability?
 *
 * Computes line wise information based in the js diff information passed. Each
 * line contains information about left and right section. Left side denotes
 * deletion and right side denotes addition.
 *
 * @param oldString Old string to compare.
 * @param newString New string to compare with old string.
 * @param disableWordDiff Flag to enable/disable word diff.
 * @param compareMethod JsDiff text diff method from https://github.com/kpdecker/jsdiff/tree/v4.0.1#api
 */
const computeLineInformation = (oldString, newString, disableWordDiff = false, compareMethod = DiffMethod.CHARS, listoferrors, bodyContents, schemaContents) => {
    const diffArray = diff.diffLines(oldString.trimRight(), newString.trimRight(), {
        newlineIsToken: true,
        ignoreWhitespace: false,
        ignoreCase: false,
    });
    let rightLineNumber = 0;
    let leftLineNumber = 0;
    let lineInformation = [];
    let counter = 0;
    const diffLines = [];
    const ignoreDiffIndexes = [];
    const getLineInformation = (value, diffIndex, added, removed, evaluateOnlyFirstLine) => {
        const lines = constructLines(value);
        return lines.map((line, lineIndex) => {
            const left = {};
            const right = {};
            if (ignoreDiffIndexes.includes(`${diffIndex}-${lineIndex}`)
                || (evaluateOnlyFirstLine && lineIndex !== 0)) {
                return undefined;
            }
            if (added || removed) {
                if (!diffLines.includes(counter)) {
                    diffLines.push(counter);
                }
                if (removed) {
                    leftLineNumber += 1;
                    left.lineNumber = leftLineNumber;
                    left.type = DiffType.REMOVED;
                    left.value = line || ' ';
                    // When the current line is of type REMOVED, check the next item in
                    // the diff array whether it is of type ADDED. If true, the current
                    // diff will be marked as both REMOVED and ADDED. Meaning, the
                    // current line is a modification.
                    const nextDiff = diffArray[diffIndex + 1];
                    if (nextDiff && nextDiff.added) {
                        const nextDiffLines = constructLines(nextDiff.value)[lineIndex];
                        if (nextDiffLines) {
                            const { value: rightValue, lineNumber, type, } = getLineInformation(nextDiff.value, diffIndex, true, false, true)[0].right;
                            ignoreDiffIndexes.push(`${diffIndex + 1}-${lineIndex}`);
                            right.lineNumber = lineNumber;
                            var flag = true;
                            var flag1 = true;
                            listoferrors.forEach(element => {
                                if (rightValue.includes(element.property) && rightValue.includes(element.instance)) {
                                    right.type = DiffType.REMOVED;
                                    left.type = DiffType.REMOVED;
                                    flag = false;
                                }
                                else {
                                    if (schemaContents != undefined) {
                                        var tempString = element.parent_and_property.toString();
                                        var temp = tempString.substring(tempString.lastIndexOf(".") + 1, tempString.length);
                                        schemaContents.forEach(element1 => {
                                            if ((element1 != undefined && flag == true && rightValue.includes("\"" + element1 + "\"") && bodyContents.includes(rightValue.toString()))) {
                                                right.type = DiffType.ADDED;
                                                left.type = DiffType.ADDED;
                                                flag1 = false;
                                            }
                                            // else if(element1!=undefined && element.parent_and_property.includes(element1) && bodyContents.includes(rightValue.toString()) && rightValue.includes("\""+temp+"\"") ){
                                            //   console.log("paapy _links","wowowowowow")
                                            //   right.type = DiffType.ADDED
                                            //   left.type = DiffType.ADDED
                                            //   flag1=false
                                            //   flag=true
                                            // }
                                        });
                                    }
                                }
                                if (flag1 == true) {
                                    flag = false;
                                    right.type = DiffType.REMOVED;
                                    left.type = DiffType.REMOVED;
                                }
                            });
                            if (!bodyContents.includes(rightValue.toString())) {
                                flag = true;
                                right.type = DiffType.ADDED;
                                left.type = DiffType.ADDED;
                            }
                            // Do word level diff and assign the corresponding values to the
                            // left and right diff information object.
                            if (disableWordDiff) {
                                right.value = rightValue;
                            }
                            else {
                                const computedDiff = computeDiff(line, rightValue, compareMethod, flag);
                                right.value = computedDiff.right;
                                left.value = computedDiff.left;
                            }
                        }
                    }
                }
                else {
                    rightLineNumber += 1;
                    right.lineNumber = rightLineNumber;
                    right.value = line;
                    var flag = true;
                    listoferrors.forEach(element => {
                        if (right.value.includes(element.property) && right.value.includes(element.instance)) {
                            right.type = DiffType.REMOVED;
                            left.type = DiffType.REMOVED;
                            flag = false;
                        }
                        if (flag == true) {
                            right.type = DiffType.REMOVED;
                            left.type = DiffType.REMOVED;
                        }
                    });
                    if (!bodyContents.includes(right.value.toString())) {
                        flag = true;
                        right.type = DiffType.ADDED;
                        left.type = DiffType.ADDED;
                    }
                }
            }
            else {
                leftLineNumber += 1;
                rightLineNumber += 1;
                left.lineNumber = leftLineNumber;
                left.type = DiffType.DEFAULT;
                left.value = line;
                right.lineNumber = rightLineNumber;
                right.type = DiffType.DEFAULT;
                right.value = line;
            }
            counter += 1;
            return { right, left };
        }).filter(Boolean);
    };
    diffArray
        .forEach(({ added, removed, value }, index) => {
        lineInformation = [
            ...lineInformation,
            ...getLineInformation(value, index, added, removed),
        ];
    });
    return {
        lineInformation, diffLines,
    };
};
exports.computeLineInformation = computeLineInformation;
