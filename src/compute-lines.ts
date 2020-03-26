import * as diff from 'diff';
import { element } from 'prop-types';
import { diff_match_patch} from 'diff-match-patch';
import 'diff-match-patch-line-and-word';

const dmp = new diff_match_patch();
const jsDiff: { [key: string]: any } = diff;
export enum DiffType {
  DEFAULT = 0,
  ADDED = 1,
  REMOVED = 2,
}

// See https://github.com/kpdecker/jsdiff/tree/v4.0.1#api for more info on the below JsDiff methods
export enum DiffMethod {
  CHARS = 'diffChars',
  WORDS = 'diffWords',
  WORDS_WITH_SPACE = 'diffWordsWithSpace',
  LINES = 'diffLines',
  TRIMMED_LINES = 'diffTrimmedLines',
  SENTENCES = 'diffSentences',
  CSS = 'diffCss',
}

export interface DiffInformation {
  value?: string | DiffInformation[];
  lineNumber?: number;
  type?: DiffType;
}

export interface LineInformation {
  left?: DiffInformation;
  right?: DiffInformation;
}

export interface ComputedLineInformation {
  lineInformation: LineInformation[];
  diffLines: number[];
}

export interface ComputedDiffInformation {
  left?: DiffInformation[];
  right?: DiffInformation[];
}

// See https://github.com/kpdecker/jsdiff/tree/v4.0.1#change-objects for more info on JsDiff
// Change Objects
export interface JsDiffChangeObject {
  added?: boolean;
  removed?: boolean;
  value?: string;
}

/**
 * Splits diff text by new line and computes final list of diff lines based on
 * conditions.
 *
 * @param value Diff text from the js diff module.
 */
const constructLines = (value: string): string[] => {
  const lines = value.split('\n');
  
  const isAllEmpty = lines.every((val): boolean => !val);
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

const restructureArray = ( diff : [number,string][] ): JsDiffChangeObject[] => {
  let diffArray: JsDiffChangeObject[] = [];
  for (let x=0; x < diff.length; x++){
    let temp:JsDiffChangeObject = {
      value : diff[x][1]
    };
    
    if (diff[x][0] == 1){
      temp.added = true;
    }else if (diff[x][0] == -1){
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
const computeDiff = (
  oldValue: string,
  newValue: string,
  compareMethod: string = DiffMethod.CHARS,
  didNotError: Boolean, 
): ComputedDiffInformation => {
  const diffs = dmp.diff_wordMode(oldValue, newValue);
  
  // console.log(diffs);
  const diffArray: JsDiffChangeObject[] = restructureArray(diffs);
  // const diffArray: JsDiffChangeObject[] = jsDiff[compareMethod](oldValue, newValue);
  // console.log(diffArray);
  const computedDiff: ComputedDiffInformation = {
    left: [],
    right: [],
  };
  diffArray
    .forEach(({ added, removed, value }): DiffInformation => {
      const diffInformation: DiffInformation = {};
      
      if (added){
        if(didNotError) {
          diffInformation.type = DiffType.ADDED;
        } else {
          diffInformation.type = DiffType.REMOVED;
        }
        diffInformation.value = value;
        computedDiff.right.push(diffInformation);
      }

      if (removed) {
        if(didNotError) {
          diffInformation.type = DiffType.ADDED;
        } else {
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
const computeLineInformation = (
  oldString: string,
  newString: string,
  disableWordDiff: boolean = false,
  compareMethod: string = DiffMethod.CHARS,
  listoferrors:  { property: string, instance: string,parent_and_property: string,enums:[]}[] ,
  bodyContents: string,
  schemaContents: string[],
  headerContents: string,
): ComputedLineInformation => {

  const diffs = dmp.diff_lineMode( oldString,newString);
  // console.log('diffs',diffs);
  const diffArray: JsDiffChangeObject[] = restructureArray(diffs);
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
  let lineInformation: LineInformation[] = [];
  let counter = 0;
  const diffLines: number[] = [];
  const ignoreDiffIndexes: string[] = [];
  const getLineInformation = (
    value: string,
    diffIndex: number,
    added?: boolean,
    removed?: boolean,
    evaluateOnlyFirstLine?: boolean,
  ): LineInformation[] => {
    const lines = constructLines(value);
    // console.log('lines',lines);
    return lines.map((line: string, lineIndex): LineInformation => {
      const left: DiffInformation = {};
      const right: DiffInformation = {};
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
              if(lineIndex < lines.length){
                // console.log('lineIndex',lineIndex,nextDiff.value.substring(lineIndex,nextDiff.value.length));
                // let temp = nextDiff.value.split('\n');
                
                // console.log(getLineInformation(nextDiff.value.substring(nextDiff.value.indexOf(temp[lineIndex])+1,nextDiff.value.length), diffIndex, true, false, true))

                const {
                  value: rightValue,
                  lineNumber,
                  type,
                } = getLineInformation(nextDiff.value.substring(nextDiff.value.indexOf(nextDiffLines),nextDiff.value.length), diffIndex, true, false, true)[0].right;

                ignoreDiffIndexes.push(`${diffIndex + 1}-${lineIndex}`);
                right.lineNumber = lineNumber;
                // console.log('value',value);
                var flag = true
                var flag1= true; 
              listoferrors.forEach(element => {
                  var inEnum = false
                  var i;
                  for (i = 0; i < element.enums.length; i++) {
                    //console.log(element.enums, "---x---" , element.enums[i])
                    if(rightValue.includes(element.enums[i]) && element.enums[i]>1){
                      inEnum = true
                    }
                  }
                  //console.log(rightValue,"and",localStorage.getItem('temp')," includes ", element.instance ,"and",element.property)
                  //|| (rightValue.includes(element.property) && inEnum) || (rightValue.includes(element.property) && localStorage.getItem('temp').includes(element.instance))  
                  if((rightValue.includes(element.property) && rightValue.includes(element.instance)) || (rightValue.includes(element.instance) && localStorage.getItem('temp').includes(element.property)) ){
                    right.type = DiffType.REMOVED
                    left.type = DiffType.REMOVED
                    flag = false
                  }
                  else{
                    if(schemaContents!=undefined){
                      var tempString = element.parent_and_property.toString()
                      var temp = tempString.substring(tempString.lastIndexOf(".")+1,tempString.length)
                      
                      schemaContents.forEach(element1 => {
                        if((element1!=undefined && flag == true && rightValue.includes("\""+element1+"\"") && bodyContents.includes(rightValue.toString()))){
                          right.type = DiffType.ADDED
                          left.type = DiffType.ADDED
                          flag1=false
                        }
                        else if(element1!=undefined && flag == true && headerContents.includes(localStorage.getItem('temp')) && headerContents.includes(rightValue.toString())  && (localStorage.getItem('temp').includes("\""+element1+"\"") && !rightValue.includes(element.instance))){
                          right.type = DiffType.ADDED
                          left.type = DiffType.ADDED
                          flag1=false
                        }
                        else if(element1!=undefined && flag == true && bodyContents.includes(localStorage.getItem('temp')) && bodyContents.includes(rightValue.toString())  && (localStorage.getItem('temp').includes("\""+element1+"\"") && !rightValue.includes(element.instance))){
                          right.type = DiffType.ADDED
                          left.type = DiffType.ADDED
                          flag1=false
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
                  
                  if(flag1 == true){
                    flag = false
                    right.type = DiffType.REMOVED
                    left.type = DiffType.REMOVED
                  }
              });

                if(!bodyContents.includes(rightValue.toString())){
                  
                  flag = true
                  right.type = DiffType.ADDED
                  left.type = DiffType.ADDED
                }
              
              // Do word level diff and assign the corresponding values to the
              // left and right diff information object.
                if (disableWordDiff) {
                  right.value = rightValue;
                } else {
                  const computedDiff = computeDiff(line, rightValue as string, compareMethod,flag);
                  right.value = computedDiff.right;
                  left.value = computedDiff.left;
                }
              }
            }
          }
        } else {
          rightLineNumber += 1;
          right.lineNumber = rightLineNumber;
          right.value = line;
          var flag = true
              listoferrors.forEach(element => {
                
                if(right.value.includes(element.property) && right.value.includes(element.instance)){
                  right.type = DiffType.REMOVED
                  left.type = DiffType.REMOVED
                  flag = false
                }

                if(flag == true){
                 right.type = DiffType.REMOVED
                  left.type = DiffType.REMOVED
                }
              });

              if(!bodyContents.includes(right.value.toString())){
                flag = true
                right.type = DiffType.ADDED
                left.type = DiffType.ADDED
              }
        }
      } else {
        leftLineNumber += 1;
        rightLineNumber += 1;
        localStorage.setItem('temp',lines[lines.length-1]);
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
    .forEach(({ added, removed, value }: diff.Change, index): void => {
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

export { computeLineInformation };
