"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeLineInformation = exports.DiffMethod = exports.DiffType = void 0;
const diff = require("diff");
const diff_match_patch_1 = require("diff-match-patch");
require("diff-match-patch-line-and-word");
const dmp = new diff_match_patch_1.diff_match_patch();
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
    // console.log('lines',lines);
    return lines;
};
const restructureArray = (diff) => {
    let diffArray = [];
    for (let x = 0; x < diff.length; x++) {
        let temp = {
            value: diff[x][1]
        };
        if (diff[x][0] == 1) {
            temp.added = true;
        }
        else if (diff[x][0] == -1) {
            temp.removed = true;
        }
        diffArray.push(temp);
    }
    return diffArray;
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
    const diffs = dmp.diff_wordMode(oldValue, newValue);
    // console.log(diffs);
    const diffArray = restructureArray(diffs);
    // const diffArray: JsDiffChangeObject[] = jsDiff[compareMethod](oldValue, newValue);
    // console.log(diffArray);
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
const computeLineInformation = (oldString, newString, disableWordDiff = false, compareMethod = DiffMethod.CHARS, listoferrors, bodyContents, schemaContents, headerContents) => {
    const diffs = dmp.diff_lineMode(oldString, newString);
    // console.log('diffs',diffs);
    const diffArray = restructureArray(diffs);
    // console.log('diffArray2',diffArray2);
    // diffLines 
    // const diffArray = diff.diffLines(
    //   oldString.trimRight(),
    //   newString.trimRight(),
    //   {
    //     newlineIsToken: true,
    //     ignoreWhitespace: false,
    //     ignoreCase: false,
    //   },
    // );
    // const diffArray = diffArray2;
    // console.log('original',diffArray);
    let rightLineNumber = 0;
    let leftLineNumber = 0;
    let lineInformation = [];
    let counter = 0;
    const diffLines = [];
    const ignoreDiffIndexes = [];
    const getLineInformation = (value, diffIndex, added, removed, evaluateOnlyFirstLine) => {
        const lines = constructLines(value);
        // console.log('lines',lines);
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
                        // console.log('nextDiff',nextDiff);
                        const nextDiffLines = constructLines(nextDiff.value)[lineIndex];
                        // console.log('diffIndex',diffIndex,'\nline',line,'\nnextDiffLines',nextDiffLines,'\nnextDiff.value',nextDiff.value)
                        if (nextDiffLines) {
                            if (lineIndex < lines.length) {
                                // console.log('lineIndex',lineIndex,nextDiff.value.substring(lineIndex,nextDiff.value.length));
                                // let temp = nextDiff.value.split('\n');
                                // console.log(getLineInformation(nextDiff.value.substring(nextDiff.value.indexOf(temp[lineIndex])+1,nextDiff.value.length), diffIndex, true, false, true))
                                const { value: rightValue, lineNumber, type, } = getLineInformation(nextDiff.value.substring(nextDiff.value.indexOf(nextDiffLines), nextDiff.value.length), diffIndex, true, false, true)[0].right;
                                ignoreDiffIndexes.push(`${diffIndex + 1}-${lineIndex}`);
                                right.lineNumber = lineNumber;
                                // console.log('value',value);
                                var flag = true;
                                var flag1 = true;
                                // listoferrors.forEach(element => {
                                for (let x = 0, len = listoferrors.length; x < len; x++) {
                                    let element = listoferrors[x];
                                    // var inEnum = false
                                    // var i;
                                    // for (i = 0; i < element.enums.length; i++) {
                                    //   //console.log(element.enums, "---x---" , element.enums[i])
                                    //   if(rightValue.includes(element.enums[i]) && element.enums[i]>1){
                                    //     inEnum = true
                                    //   }
                                    // console.log("element",element)
                                    // }
                                    //console.log(rightValue,"and",localStorage.getItem('temp')," includes ", element.instance ,"and",element.property)
                                    //|| (rightValue.includes(element.property) && inEnum) || (rightValue.includes(element.property) && localStorage.getItem('temp').includes(element.instance))  
                                    if ((rightValue.includes(element.property) && rightValue.includes(element.instance)) || (rightValue.includes(element.instance) && localStorage.getItem('temp').includes(element.property))) {
                                        right.type = DiffType.REMOVED;
                                        left.type = DiffType.REMOVED;
                                        flag = false;
                                    }
                                }
                                // else{
                                if (schemaContents != undefined && flag) {
                                    // var tempString = element.parent_and_property.toString()
                                    // var temp = tempString.substring(tempString.lastIndexOf(".")+1,tempString.length)
                                    // console.log("schemaContents",schemaContents)
                                    // console.log('rightValue',rightValue)
                                    // schemaContents.forEach(element1 => {
                                    for (let x = 0, len = schemaContents.length, localTemp = localStorage.getItem('temp'); x < len; x++) {
                                        let element1 = schemaContents[x];
                                        if (element1 != undefined) {
                                            if ((rightValue.includes("\"" + element1 + "\"") && bodyContents.includes(rightValue.toString()))
                                                || (((headerContents.includes(localTemp) && headerContents.includes(rightValue.toString())
                                                    || bodyContents.includes(localStorage.getItem('temp')) && bodyContents.includes(rightValue.toString())) && localTemp.includes("\"" + element1 + "\"")))) {
                                                right.type = DiffType.ADDED;
                                                left.type = DiffType.ADDED;
                                                flag1 = false;
                                            }
                                        }
                                        // if((element1!=undefined && flag == true &&)){
                                        //   right.type = DiffType.ADDED
                                        //   left.type = DiffType.ADDED
                                        //   flag1=false
                                        // }
                                        // else if(element1!=undefined && flag == true &&  !rightValue.includes(element.instance))){
                                        //   right.type = DiffType.ADDED
                                        //   left.type = DiffType.ADDED
                                        //   flag1=false
                                        // }
                                        // else if(element1!=undefined && flag == true && bodyContents.includes(localStorage.getItem('temp')) && bodyContents.includes(rightValue.toString())  && (localStorage.getItem('temp').includes("\""+element1+"\"") && !rightValue.includes(element.instance))){
                                        //   right.type = DiffType.ADDED
                                        //   left.type = DiffType.ADDED
                                        //   flag1=false
                                        // }
                                        // else if(element1!=undefined && element.parent_and_property.includes(element1) && bodyContents.includes(rightValue.toString()) && rightValue.includes("\""+temp+"\"") ){
                                        //   console.log("paapy _links","wowowowowow")
                                        //   right.type = DiffType.ADDED
                                        //   left.type = DiffType.ADDED
                                        //   flag1=false
                                        //   flag=true
                                        // }
                                        // });
                                    }
                                }
                                // }
                                if (flag1 == true) {
                                    flag = false;
                                    right.type = DiffType.REMOVED;
                                    left.type = DiffType.REMOVED;
                                }
                                // }
                                // });
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
                }
                else {
                    rightLineNumber += 1;
                    right.lineNumber = rightLineNumber;
                    right.value = line;
                    var flag = true;
                    // listoferrors.forEach(element => {
                    for (let x = 0, len = listoferrors.length; x < len; x++) {
                        let element = listoferrors[x];
                        if (right.value.includes(element.property) && right.value.includes(element.instance)) {
                            right.type = DiffType.REMOVED;
                            left.type = DiffType.REMOVED;
                            flag = false;
                        }
                        if (flag == true) {
                            right.type = DiffType.REMOVED;
                            left.type = DiffType.REMOVED;
                        }
                        // });
                    }
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
                localStorage.setItem('temp', lines[lines.length - 1]);
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
        // console.log("INDEX",index,"VALUE",value, 'lineInformation',lineInformation);
        lineInformation = [
            ...lineInformation,
            ...getLineInformation(value, index, added, removed),
        ];
    });
    // console.log('lineInformation',lineInformation);
    return {
        lineInformation, diffLines,
    };
};
exports.computeLineInformation = computeLineInformation;
