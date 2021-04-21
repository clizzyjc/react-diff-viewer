import * as React from 'react';
import * as PropTypes from 'prop-types';
import cn from 'classnames';
import {Validator} from "jsonschema";
import InfiniteScroll from 'react-infinite-scroll-component';

import {
  computeLineInformation,
  LineInformation,
  DiffInformation,
  DiffType,
  DiffMethod,
} from './compute-lines';
import computeStyles, { ReactDiffViewerStylesOverride, ReactDiffViewerStyles } from './styles';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const m = require('memoize-one');

const memoize = m.default || m;

export enum LineNumberPrefix {
  LEFT = 'L',
  RIGHT = 'R',
}

export interface ReactDiffViewerProps {
  schemaRequest: string,
  schemaResponse: string,
  // Old value to compare.
  oldValue: string;
  // New value to compare.
  newValue: string;
  // Enable/Disable split view.
  splitView?: boolean;
  // Enable/Disable word diff.
  disableWordDiff?: boolean;
  // JsDiff text diff method from https://github.com/kpdecker/jsdiff/tree/v4.0.1#api
  compareMethod?: DiffMethod;
  // Number of unmodified lines surrounding each line diff.
  extraLinesSurroundingDiff?: number;
  // Show/hide line number.
  hideLineNumbers?: boolean;
  // Show only diff between the two values.
  showDiffOnly?: boolean;
  // Render prop to format final string before displaying them in the UI.
  renderContent?: (source: string) => JSX.Element;
  // Render prop to format code fold message.
  codeFoldMessageRenderer?: (
    totalFoldedLines: number,
    leftStartLineNumber: number,
    rightStartLineNumber: number,
  ) => JSX.Element;
  // Event handler for line number click.
  onLineNumberClick?: (
    lineId: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => void;
  // Array of line ids to highlight lines.
  highlightLines?: string[];
  // Style overrides.
  styles?: ReactDiffViewerStylesOverride;
  // Use dark theme.
  useDarkTheme?: boolean;
  // Title for left column
  leftTitle?: string;
  // Title for left column
  rightTitle?: string | JSX.Element;
}

export interface ReactDiffViewerState {
  // Array holding the expanded code folding.
  expandedBlocks?: number[],
  prev: number,
  next: number,
  hasMore: boolean,
  current : JSX.Element[],
  data: JSX.Element[],
}

class DiffViewer extends React.Component<ReactDiffViewerProps, ReactDiffViewerState> {
  private styles: ReactDiffViewerStyles;

  public static defaultProps: ReactDiffViewerProps = {
    schemaRequest: '',
    schemaResponse: '',
    oldValue: '',
    newValue: '',
    splitView: true,
    highlightLines: [],
    disableWordDiff: false,
    compareMethod: DiffMethod.CHARS,
    styles: {},
    hideLineNumbers: false,
    extraLinesSurroundingDiff: 3,
    showDiffOnly: true,
    useDarkTheme: false,
  };

  public static propTypes = {
    schemaRequest: PropTypes.string.isRequired,
    schemaResponse: PropTypes.string.isRequired,
    oldValue: PropTypes.string.isRequired,
    newValue: PropTypes.string.isRequired,
    splitView: PropTypes.bool,
    disableWordDiff: PropTypes.bool,
    compareMethod: PropTypes.oneOf(Object.values(DiffMethod)),
    renderContent: PropTypes.func,
    onLineNumberClick: PropTypes.func,
    extraLinesSurroundingDiff: PropTypes.number,
    styles: PropTypes.object,
    hideLineNumbers: PropTypes.bool,
    showDiffOnly: PropTypes.bool,
    highlightLines: PropTypes.arrayOf(PropTypes.string),
    leftTitle: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.element,
    ]),
    rightTitle: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.element,
    ]),
  };

  public constructor(props: ReactDiffViewerProps) {
    super(props);
    this.styles = this.computeStyles(this.props.styles, false);
    let data = this.renderDiff().filter((val) => {
      return val != null;
    });
    this.state = {
      expandedBlocks: [],
      prev: 0,
      next: 300,
      hasMore: true,
      data: data,
      current : data.slice(0,300)
    };
  }

  /**
   * Resets code block expand to the initial stage. Will be exposed to the parent component via
   * refs.
   */
  public resetCodeBlocks = (): boolean => {
    if (this.state.expandedBlocks.length > 0) {
      this.setState({
        expandedBlocks: [],
      });
      return true;
    }
    return false;
  }

  public getMoreData = () => {
    if (this.state.current.length === this.state.data.length) {
      this.setState({hasMore:false});
      return;
    }
    setTimeout(() => {
        this.setState({
          current:this.state.current.concat(this.state.data.slice(this.state.prev, this.state.next))
        })
    //   setCurrent(current.concat(this.state..slice(count.prev + 10, count.next + 10)))
    }, 100)
  
    this.setState(prevState => ({
        prev: prevState.prev + 300,
        next: prevState.next + 300
      }));
    // this.setState({prev: prev +10, next: next +10})
    // setCount((prevState) => ({ prev: prevState.prev + 10, next: prevState.next + 10 }))
  }
  /**
   * Pushes the target expanded code block to the state. During the re-render,
   * this value is used to expand/fold unmodified code.
   */
  private onBlockExpand = (id: number): void => {
    const prevState = this.state.expandedBlocks.slice();
    prevState.push(id);

    this.setState({
      expandedBlocks: prevState,
    });
  };

  /**
   * Computes final styles for the diff viewer. It combines the default styles with the user
   * supplied overrides. The computed styles are cached with performance in mind.
   *
   * @param styles User supplied style overrides.
   */
  private computeStyles: (
    styles: ReactDiffViewerStylesOverride,
    useDarkTheme: boolean,
  ) => ReactDiffViewerStyles = memoize(computeStyles);

  /**
   * Returns a function with clicked line number in the closure. Returns an no-op function when no
   * onLineNumberClick handler is supplied.
   *
   * @param id Line id of a line.
   */
  private onLineNumberClickProxy = (id: string): any => {
    if (this.props.onLineNumberClick) {
      return (e: any): void => this.props.onLineNumberClick(id, e);
    }
    return (): void => { };
  };

  /**
   * Maps over the word diff and constructs the required React elements to show word diff.
   *
   * @param diffArray Word diff information derived from line information.
   * @param renderer Optional renderer to format diff words. Useful for syntax highlighting.
   */
  private renderWordDiff = (
    diffArray: DiffInformation[],
    renderer?: (chunk: string) => JSX.Element,
  ): JSX.Element[] => {
    return diffArray.map(
      (wordDiff, i): JSX.Element => {
        return (
          <span
            key={i}
            className={cn(this.styles.wordDiff, {
              [this.styles.wordAdded]: wordDiff.type === DiffType.ADDED,
              [this.styles.wordRemoved]: wordDiff.type === DiffType.REMOVED,
            })}
          >
            {renderer ? renderer(wordDiff.value as string) : wordDiff.value}
          </span>
        );
      },
    );
  };

  /**
   * Maps over the line diff and constructs the required react elements to show line diff. It calls
   * renderWordDiff when encountering word diff. This takes care of both inline and split view line
   * renders.
   *
   * @param lineNumber Line number of the current line.
   * @param type Type of diff of the current line.
   * @param prefix Unique id to prefix with the line numbers.
   * @param value Content of the line. It can be a string or a word diff array.
   * @param additionalLineNumber Additional line number to be shown. Useful for rendering inline
   *  diff view. Right line number will be passed as additionalLineNumber.
   * @param additionalPrefix Similar to prefix but for additional line number.
   */
  private renderLine = (
    lineNumber: number,
    type: DiffType,
    prefix: LineNumberPrefix,
    value: string | DiffInformation[],
    additionalLineNumber?: number,
    additionalPrefix?: LineNumberPrefix,
  ): JSX.Element => {
    const lineNumberTemplate = `${prefix}-${lineNumber}`;
    const additionalLineNumberTemplate = `${additionalPrefix}-${additionalLineNumber}`;
    const highlightLine = this.props.highlightLines.includes(lineNumberTemplate)
      || this.props.highlightLines.includes(additionalLineNumberTemplate);
    const added = type === DiffType.ADDED;
    const removed = type === DiffType.REMOVED;
    let content;
    if (Array.isArray(value)) {
      content = this.renderWordDiff(value, this.props.renderContent);
    } else if (this.props.renderContent) {
      content = this.props.renderContent(value);
    } else {
      content = value;
    }

    return (
      <React.Fragment>
        {!this.props.hideLineNumbers && (
          <td
            onClick={
              lineNumber && this.onLineNumberClickProxy(lineNumberTemplate)
            }
            className={cn(this.styles.gutter, {
              [this.styles.emptyGutter]: !lineNumber,
              [this.styles.diffAdded]: added,
              [this.styles.diffRemoved]: removed,
              [this.styles.highlightedGutter]: highlightLine,
            })}
          >
            <pre className={this.styles.lineNumber}>{lineNumber}</pre>
          </td>
        )}
        {!this.props.splitView && !this.props.hideLineNumbers && (
          <td
            onClick={
              additionalLineNumber
              && this.onLineNumberClickProxy(additionalLineNumberTemplate)
            }
            className={cn(this.styles.gutter, {
              [this.styles.emptyGutter]: !additionalLineNumber,
              [this.styles.diffAdded]: added,
              [this.styles.diffRemoved]: removed,
              [this.styles.highlightedGutter]: highlightLine,
            })}
          >
            <pre className={this.styles.lineNumber}>{additionalLineNumber}</pre>
          </td>
        )}
        <td
          className={cn(this.styles.marker, {
            [this.styles.emptyLine]: !content,
            [this.styles.diffAdded]: added,
            [this.styles.diffRemoved]: removed,
            [this.styles.highlightedLine]: highlightLine,
          })}
        >
          <pre>
            {added && '+'}
            {removed && '-'}
          </pre>
        </td>
        <td
          className={cn(this.styles.content, {
            [this.styles.emptyLine]: !content,
            [this.styles.diffAdded]: added,
            [this.styles.diffRemoved]: removed,
            [this.styles.highlightedLine]: highlightLine,
          })}
        >
          <pre className={this.styles.contentText}>{content}</pre>
        </td>
      </React.Fragment>
    );
  };

  /**
   * Generates lines for split view.
   *
   * @param obj Line diff information.
   * @param obj.left Life diff information for the left pane of the split view.
   * @param obj.right Life diff information for the right pane of the split view.
   * @param index React key for the lines.
   */
  private renderSplitView = (
    { left, right }: LineInformation,
    index: number,
  ): JSX.Element => {
    return (
      <tr key={index} className={this.styles.line}>
        {this.renderLine(
          left.lineNumber,
          left.type,
          LineNumberPrefix.LEFT,
          left.value,
        )}
        {this.renderLine(
          right.lineNumber,
          right.type,
          LineNumberPrefix.RIGHT,
          right.value,
        )}
      </tr>
    );
  };

  /**
   * Generates lines for inline view.
   *
   * @param obj Line diff information.
   * @param obj.left Life diff information for the added section of the inline view.
   * @param obj.right Life diff information for the removed section of the inline view.
   * @param index React key for the lines.
   */
  public renderInlineView = (
    { left, right }: LineInformation,
    index: number,
  ): JSX.Element => {
    let content;
    if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
      return (
        <React.Fragment key={index}>
          <tr className={this.styles.line}>
            {this.renderLine(
              left.lineNumber,
              left.type,
              LineNumberPrefix.LEFT,
              left.value,
              null,
            )}
          </tr>
          <tr className={this.styles.line}>
            {this.renderLine(
              null,
              right.type,
              LineNumberPrefix.RIGHT,
              right.value,
              right.lineNumber,
            )}
          </tr>
        </React.Fragment>
      );
    }
    if (left.type === DiffType.REMOVED) {
      content = this.renderLine(
        left.lineNumber,
        left.type,
        LineNumberPrefix.LEFT,
        left.value,
        null,
      );
    }
    if (left.type === DiffType.DEFAULT) {
      content = this.renderLine(
        left.lineNumber,
        left.type,
        LineNumberPrefix.LEFT,
        left.value,
        right.lineNumber,
        LineNumberPrefix.RIGHT,
      );
    }
    if (right.type === DiffType.ADDED) {
      content = this.renderLine(
        null,
        right.type,
        LineNumberPrefix.RIGHT,
        right.value,
        right.lineNumber,
      );
    }

    return <tr key={index} className={this.styles.line}>{content}</tr>;
  };

  /**
   * Returns a function with clicked block number in the closure.
   *
   * @param id Cold fold block id.
   */
  private onBlockClickProxy = (id: number): any => (): void => this.onBlockExpand(id);

  /**
   * Generates cold fold block. It also uses the custom message renderer when available to show
   * cold fold messages.
   *
   * @param num Number of skipped lines between two blocks.
   * @param blockNumber Code fold block id.
   * @param leftBlockLineNumber First left line number after the current code fold block.
   * @param rightBlockLineNumber First right line number after the current code fold block.
   */
  private renderSkippedLineIndicator = (
    num: number,
    blockNumber: number,
    leftBlockLineNumber: number,
    rightBlockLineNumber: number,
  ): JSX.Element => {
    const { splitView } = this.props;
    const message = this.props.codeFoldMessageRenderer
      ? this.props
        .codeFoldMessageRenderer(num, leftBlockLineNumber, rightBlockLineNumber)
      : <pre className={this.styles.codeFoldContent}>Expand {num} lines ...</pre>;
    const content = (
      <td>
        <a onClick={this.onBlockClickProxy(blockNumber)} tabIndex={0}>
          {message}
        </a>
      </td>
    );
    return (
      <tr key={`${leftBlockLineNumber}-${rightBlockLineNumber}`} className={this.styles.codeFold}>
        {!this.props.hideLineNumbers && (
          <td className={this.styles.codeFoldGutter} />
        )}
        <td className={cn({ [this.styles.codeFoldGutter]: !splitView })} />
        {splitView ? content : <td />}
        {!splitView ? content : <td />}
        <td />
        <td />
      </tr>
    );
  };

  public insertMissing = (temp:any,leftTitle:any, index:any, nextArrayObjectBracket:any, schema:any, missing:any, lineNumber:any, location:any, deducter:any) => {
    let loc = location.split('-');
    let spaces = temp[0].split(" ").length -1;
    if (temp[1].includes('{') && nextArrayObjectBracket == null ){
      let searchValue: any = ' '.repeat(spaces)+"}";

      let lineNumba = schema[loc[1]][loc[2]].indexOf(searchValue,index);
      let lineNumba2 = schema[loc[1]][loc[2]].indexOf(searchValue+",",index);
      let chosenLineNumber = lineNumba2;
      if (lineNumba != -1 && lineNumba < lineNumba2){
        chosenLineNumber = lineNumba
      }
      nextArrayObjectBracket = {
        lineNumber:  chosenLineNumber,
        value: temp[0],
        deducter:deducter,
        originalLineNumber: lineNumber
      };
    }else if ( temp[1].includes('[') && nextArrayObjectBracket == null ){
      let searchValue: any = ' '.repeat(spaces)+"]";
      let lineNumba = schema[loc[1]][loc[2]].indexOf(searchValue,index);
      let lineNumba2 = schema[loc[1]][loc[2]].indexOf(searchValue+",",index);
      let chosenLineNumber = lineNumba2;
      if (lineNumba != -1 && lineNumba < lineNumba2){
        chosenLineNumber = lineNumba
      }
      nextArrayObjectBracket = {
        lineNumber:chosenLineNumber,
        value: temp[0],
        deducter:deducter,
        originalLineNumber: lineNumber
      };
    }
  
   
    if (nextArrayObjectBracket != null && lineNumber-nextArrayObjectBracket.deducter < nextArrayObjectBracket.lineNumber && lineNumber-nextArrayObjectBracket.deducter != nextArrayObjectBracket.originalLineNumber-nextArrayObjectBracket.deducter){
       //part of the array
        
       let pos = missing[leftTitle].findIndex((i: { value: any; }) => i.value === nextArrayObjectBracket.value );
       missing[leftTitle][pos].children.push(temp[0]);
    }else{
      // console.log(nextArrayObjectBracket)
      let pos = missing[leftTitle].findIndex((i: { value: any; }) => i.value === temp[0] );
      if(pos == -1){
        missing[leftTitle].push({
          location: location,
          value: temp[0],
          children: []
        })
      }
     
    }
      return nextArrayObjectBracket
  }
  /**
   * Generates the entire diff view.
   */
  private renderDiff = (): JSX.Element[] => {
    const { oldValue, newValue, splitView, disableWordDiff,
       compareMethod, schemaRequest, schemaResponse } = this.props;
    var v = new Validator();
    let leftTitle:any = this.props.leftTitle;
    var content = newValue;
    var content2 = oldValue;
    var occurence2 = content2.match(/Body  \:/g).length;
    var occurrence = content.match(/Body  \:/g).length;
    const body_pattern_to_find = "Body  :";
    const body_pattern_to_find_v2 = "Body   :";
    const header_pattern_to_find = "Header: ";
    var flag = false
    var result = [];
    var result2 = [];
    var headerres:string[] = [];
    var headerres2:string[] = [];

    const regex = /\[\d{4}/g;
    const yearDatePattern = content.match(regex)[0];
    const yearDatePattern2 = content2.match(regex)[0];
    // left side
    let oldBodyIndex =0;
    let request_header_counter = 0;
    let response_header_counter = 0;
    for(var i = 0; i < occurence2; i ++) {
      var body_index = content2.indexOf("{",content2.indexOf(body_pattern_to_find)+1);
      var next_timestamp_index = content2.indexOf(yearDatePattern2,content2.indexOf(body_pattern_to_find)+1)
      if(next_timestamp_index < body_index) {
        result2[i] = "{}";
        flag = true
        oldBodyIndex=next_timestamp_index
      } 
      else if(body_index < 0) {
        result2[i] = "{}";
      }
      else {
        if (i == 0){
          oldBodyIndex =content2.indexOf(yearDatePattern2,content2.indexOf(body_pattern_to_find)+1)-1;
        }
        result2[i] = content2.substring(body_index,content2.indexOf(yearDatePattern2,content2.indexOf(body_pattern_to_find)+1)-1);
      }
      var header_index = content2.indexOf("{",content2.indexOf(header_pattern_to_find)+1)
      if (i == 0){
        //req header
        request_header_counter = content2.substring(0,header_index).split(/\r?\n/).filter((x)=>{ return x != ""}).length-1;
      }
      
      headerres2[i] = content2.substring(header_index,content2.indexOf(yearDatePattern2,content2.indexOf(header_pattern_to_find)+1)-1)
     
      content2 = content2.replace(content2.substring(content2.indexOf(body_pattern_to_find) - 10,content2.indexOf(yearDatePattern2,content2.indexOf(body_pattern_to_find)+1)),"");
      content2 = content2.replace(content2.substring(content2.indexOf(header_pattern_to_find) - 10,content2.indexOf(yearDatePattern2,content2.indexOf(header_pattern_to_find)+1)),"");
      if(occurence2 === 1 && !flag) {
        var body_index2 = content2.indexOf("{",content2.indexOf(body_pattern_to_find_v2)+1);
        result2[1] = content2.substring(body_index2,content2.indexOf(yearDatePattern2,content2.indexOf(body_pattern_to_find_v2)+1)-1);
        header_index = content2.indexOf("{",content2.indexOf(header_pattern_to_find)+1)
        headerres2[1] = content2.substring(header_index,content2.indexOf(yearDatePattern2,content2.indexOf(header_pattern_to_find)+1)-1)
        content2 = content2.replace(content2.substring(content2.indexOf(body_pattern_to_find_v2) - 10,content2.indexOf(yearDatePattern2,content2.indexOf(body_pattern_to_find_v2)+1)),"");
        content2 = content2.replace(content2.substring(content2.indexOf(header_pattern_to_find) - 10,content2.indexOf(yearDatePattern2,content2.indexOf(header_pattern_to_find)+1)),"");
      }
      if (i==1 || (occurence2 === 1 && !flag)) {
        response_header_counter =oldValue.substring(oldBodyIndex+1,oldValue.indexOf(header_pattern_to_find,oldBodyIndex)+1).split(/\r?\n/).filter((x)=>{return x!=""}).length -1;
      }
    }
    let oldSchema:any = {
      request: {
        header: Array(request_header_counter).fill("").concat(headerres2[0].split(/\r|\n/)),
        body: []
      },
      response : {
        header: Array(response_header_counter).fill("").concat(headerres2[1].split(/\r|\n/)),
        body: []
      }
    };
    
    flag = false;
    // right side 
    oldBodyIndex = 0;
    for(var i = 0; i < occurrence; i ++) {
      var body_index = content.indexOf("{",content.indexOf(body_pattern_to_find)+1);
      var next_timestamp_index = content.indexOf(yearDatePattern,content.indexOf(body_pattern_to_find)+1)
      if(next_timestamp_index < body_index) {
        oldBodyIndex = next_timestamp_index
        result[i] = "{}";
        flag = true
      } 
      else if(body_index < 0) {
        result[i] = "{}";
      }
      else {
        if (i == 0){
          oldBodyIndex =content.indexOf(yearDatePattern,content.indexOf(body_pattern_to_find)+1)-1;
        }
        result[i] = content.substring(body_index,content.indexOf(yearDatePattern,content.indexOf(body_pattern_to_find)+1)-1);
      }
      var header_index = content.indexOf("{",content.indexOf(header_pattern_to_find)+1)
      if (i == 0){
        //req header
        request_header_counter = content.substring(0,header_index).split(/\r?\n/).filter((x)=>{return x!=""}).length-1;
      }
     
      headerres[i] = content.substring(header_index,content.indexOf(yearDatePattern,content.indexOf(header_pattern_to_find)+1)-1)
      content = content.replace(content.substring(content.indexOf(body_pattern_to_find) - 10,content.indexOf(yearDatePattern,content.indexOf(body_pattern_to_find)+1)),"");
      content = content.replace(content.substring(content.indexOf(header_pattern_to_find) - 10,content.indexOf(yearDatePattern,content.indexOf(header_pattern_to_find)+1)),"");
      if(occurrence === 1 && !flag) {
        var body_index2 = content.indexOf("{",content.indexOf(body_pattern_to_find_v2)+1);
        result[1] = content.substring(body_index2,content.indexOf(yearDatePattern,content.indexOf(body_pattern_to_find_v2)+1)-1);
        header_index = content.indexOf("{",content.indexOf(header_pattern_to_find)+1)
        headerres[1] = content.substring(header_index,content.indexOf(yearDatePattern,content.indexOf(header_pattern_to_find)+1)-1)
        content = content.replace(content.substring(content.indexOf(body_pattern_to_find_v2) - 10,content.indexOf(yearDatePattern,content.indexOf(body_pattern_to_find_v2)+1)),"");
        content = content.replace(content.substring(content.indexOf(header_pattern_to_find) - 10,content.indexOf(yearDatePattern,content.indexOf(header_pattern_to_find)+1)),"");
      }
      if (i==1 || (occurrence === 1 && !flag)) {
        response_header_counter =newValue.substring(oldBodyIndex+1,newValue.indexOf(header_pattern_to_find,oldBodyIndex)+1).split(/\r?\n/).filter((x)=>{return x!=""}).length -1;
      }
    }
    
    var ValidationResult = null
    var listofErrors : { property: string, instance: string,parent_and_property: string, enums:[]}[] = [];
    var schemaContent=["xp;[fvbscplaceholderasdasaa"];
    var counter = 0
    // get counter of first header
    let newSchema:any = {
      request: {
        header: Array(request_header_counter).fill("").concat(headerres[0].split(/\r|\n/)),
        body: []
      },
      response : {
        header:Array(response_header_counter).fill("").concat(headerres[1].split(/\r|\n/)),
        body: []
      }
    };
    
    result2.forEach(element => {
      if(null !== element) {
        if(counter==0){
          oldSchema.request.body =element.split(/\r|\n/);
          counter++
        }
        else{
          var len = element.length -1;
          let tempElem = element;
          if (element[len] == ']' && element[0] != element[len]){
            // tempElem = element.substr(0, len-1);
            tempElem = "[\n".concat(tempElem);
          }
          oldSchema.response.body = tempElem.split(/\r|\n/)
        }
      }
    });
    counter = 0;
    result.forEach(element => {
      if(null !== element) {
        if(counter==0){
          var tempConcatVar ="{"
          var temporaryBodyStringHolder = tempConcatVar.concat("\"header\":",headerres[counter],",\"body\":",element,"}")
          newSchema.request.body =element.split(/\r|\n/);
          var ParsedJsonHeaderandBody = JSON.parse(temporaryBodyStringHolder)
          ValidationResult = v.validate(ParsedJsonHeaderandBody, JSON.parse(schemaRequest));
          counter++
        }
        else{
          var tempConcatVar ="{"
          var len = element.length -1;
          let tempElem = element;
          if (element[len] == ']' && element[0] != element[len]){
            tempElem = "[\n".concat(tempElem);
          }
          
          var temporaryBodyStringHolder = tempConcatVar.concat("\"header\":",headerres[counter],",\"body\":",tempElem,"}")
          var ParsedJsonHeaderandBody = JSON.parse(temporaryBodyStringHolder)
          newSchema.response.body = tempElem.split(/\r|\n/)
          ValidationResult = v.validate(ParsedJsonHeaderandBody, JSON.parse(schemaResponse));
        }
        // schemaContent = schemaContent.concat(typeof ValidationResult.schema.required == "boolean"?""+ValidationResult.schema.required:ValidationResult.schema.required) 
        schemaContent = schemaContent.concat(ValidationResult.schema.required) 

        if(ValidationResult!=null){
          for (var i = 0, len = ValidationResult.errors.length; i < len; i++) {
              let element =  ValidationResult.errors[i];
              var temp = element.property.substring(element.property.lastIndexOf(".")+1,element.property.length)
              temp = temp.includes("[") ? temp.substring(0,temp.indexOf("[")) : temp ;
              if(element.argument==null){
                listofErrors.push({
                property :temp,
                instance :element.instance,
                parent_and_property: "-=xzcadaaplaceholder/*-+-*/",
                enums: element.argument
              });
              }
              else{
                listofErrors.push({
                  property :temp,
                  instance :element.instance,
                  parent_and_property: element.argument,
                  enums: element.argument
                });
              }
            // Do stuff with arr[i]
          }
          // ValidationResult.errors.forEach(element => {
          //   var temp = element.property.substring(element.property.lastIndexOf(".")+1,element.property.length)
          //   temp = temp.includes("[") ? temp.substring(0,temp.indexOf("[")) : temp ;
          //   if(element.argument==null){
          //     listofErrors.push({
          //     property :temp,
          //     instance :element.instance,
          //     parent_and_property: "-=xzcadaaplaceholder/*-+-*/",
          //     enums: element.argument
          //   });
          //   }
          //   else{
          //     listofErrors.push({
          //       property :temp,
          //       instance :element.instance,
          //       parent_and_property: element.argument,
          //       enums: element.argument
          //     });
          //   }
          // });
        }
      }
    });
    var concatenatedStr = "".concat(result[0],headerres[0],result[1],headerres[1]);
    var concatenatedHeader = "".concat(headerres[0],headerres[1]);

    const { lineInformation, diffLines } = computeLineInformation(
      oldValue,
      newValue,
      disableWordDiff,
      compareMethod,
      listofErrors,
      concatenatedStr,
      schemaContent,
      concatenatedHeader
    );
    
    // let filteredLineInformation = lineInformation.filter((val) => {
    //   return val.left.type ==2 || val.right.type == 2;
    // });
    let filteredLineInformation = lineInformation;
    
      // lineNumber: number,
      // value: String,
      // deducter: number,
      // originalLineNumber: number
// JSON.parse(localStorage.getItem("missing")) || 
    let missing: {[key:string]:any[]}= {};
    missing[leftTitle]=[];
    const old_req_header_length = oldSchema.request.header.length;
    const old_req_body_length = (oldSchema.request.header.length + oldSchema.request.body.length);
    const old_resp_header_length = (oldSchema.request.header.length + oldSchema.request.body.length + oldSchema.response.header.length);
    const old_resp_body_length = (oldSchema.request.header.length + oldSchema.request.body.length + oldSchema.response.header.length +oldSchema.response.body.length);

    const new_req_header_length = newSchema.request.header.length;
    const new_req_body_length = (newSchema.request.header.length + newSchema.request.body.length);
    const new_resp_header_length = (newSchema.request.header.length + newSchema.request.body.length + newSchema.response.header.length);
    const new_resp_body_length=(newSchema.request.header.length + newSchema.request.body.length + newSchema.response.header.length +newSchema.response.body.length);
    

    let nextArrayObjectBracket:any = null;
    let nextArrayObjectBracket2:any = null;
    let flagDoubleObj = false;

    filteredLineInformation.map((value)=> {
      let leftVal:any =  value.left.value;
      let rightVal:any = value.right.value;
      flagDoubleObj = false;
      if (value.left.value != undefined){
        if(Array.isArray(leftVal)){
          if(typeof leftVal[0] == 'object' && leftVal[0]!= undefined) {
            let ndx = 0;
            if ( /\S/.test(leftVal[0].value.replace('"','')) == false){
              ndx = leftVal[2] != undefined? 2: 1;
            }

            flagDoubleObj = leftVal[ndx].value.includes(':');
            leftVal = leftVal.map((elem) => {
                return elem.value
                }).join();
          }else{
              let ndx = 0;
              if (/\S/.test(leftVal[0].replace('"','')) == false){
                ndx = leftVal[2] != undefined? 2: 1;
              }

              flagDoubleObj = leftVal[ndx].includes(':');
              leftVal = leftVal.join();
          }
        } 
        leftVal = leftVal.replaceAll(",",'').split(':');
      }
      if (value.right.value != undefined){
        if(Array.isArray(rightVal)){

          if(typeof rightVal[0] == 'object') {
            let ndx = 0;
            if (/\S/.test(rightVal[0].value.replace('"','')) == false){
              ndx = rightVal[2] != undefined? 2: 1;
            }

            flagDoubleObj = rightVal[ndx].value.includes(':');

             rightVal = rightVal.map((elem) => {
               return elem.value
             }).join();
           }else{
            let ndx = 0;
            if (/\S/.test(rightVal[0].replace('"','')) == false){
              ndx = rightVal[2] != undefined? 2: 1;
            }

            flagDoubleObj = rightVal[ndx].includes(':');
            rightVal = rightVal.join();
           }
        } 
        rightVal = rightVal.replaceAll(",",'').split(':');
      }
      
      if (value.left.value == undefined || value.right.value == undefined  || flagDoubleObj){
        if (value.right.value == undefined || flagDoubleObj ){
          if ( leftVal.length > 1 ){
            //missing left side
            if (nextArrayObjectBracket != null && (value.left.lineNumber-nextArrayObjectBracket.deducter) >= nextArrayObjectBracket.lineNumber ){
              nextArrayObjectBracket = null;
            }
            
            if(
              ( value.left.lineNumber <= old_req_header_length && 
              newSchema.request.header.filter((x:any)=>{ return x.includes(leftVal[0])}).length < 1 ) ||
              (nextArrayObjectBracket != null && value.left.lineNumber > nextArrayObjectBracket.originalLineNumber && value.left.lineNumber-nextArrayObjectBracket.deducter <= nextArrayObjectBracket.lineNumber)

            ){
              //req header
              nextArrayObjectBracket= this.insertMissing(leftVal,leftTitle,value.left.lineNumber-1 ,nextArrayObjectBracket, oldSchema, missing, value.left.lineNumber, "Left-request-header",1)
              // console.log("LEFT REQ-HEADER",oldSchema.request.header[])
            }else if (
            (value.left.lineNumber > old_req_header_length && value.left.lineNumber <= old_req_body_length && 
              newSchema.request.body.filter((x:any)=>{ return x.includes(leftVal[0])}).length < 1 ) || 
            (nextArrayObjectBracket != null && value.left.lineNumber > nextArrayObjectBracket.originalLineNumber && value.left.lineNumber-nextArrayObjectBracket.deducter <= nextArrayObjectBracket.lineNumber)
            ){
              //req body
              let newValue = value.left.lineNumber-oldSchema.request.header.length -1;
              nextArrayObjectBracket= this.insertMissing(leftVal,leftTitle,newValue,nextArrayObjectBracket, oldSchema, missing, value.left.lineNumber, "Left-request-body",oldSchema.request.header.length +1)
              // console.log("LEFT REQ-BODY",oldSchema.request.body[.left.lineNumber.left.lineNumber-oldSchema.request.header.length -1])
            }else if (
              (value.left.lineNumber > old_req_body_length && value.left.lineNumber <= old_resp_header_length && 
               newSchema.response.header.filter((x:any)=>{ return x.includes(leftVal[0])}).length < 1) || 
               (nextArrayObjectBracket != null && value.left.lineNumber > nextArrayObjectBracket.originalLineNumber && value.left.lineNumber-nextArrayObjectBracket.deducter <= nextArrayObjectBracket.lineNumber) 
            ){
              // resp header
              let newValue =value.left.lineNumber-oldSchema.request.header.length - oldSchema.request.body.length -1;
              // console.log("LEFT RESP-HEADER",oldSchema.response.header[newValue])
              nextArrayObjectBracket= this.insertMissing(leftVal,leftTitle,newValue,nextArrayObjectBracket, oldSchema, missing, value.left.lineNumber, "Left-response-header",oldSchema.request.header.length + oldSchema.request.body.length +1)
            }else if (
              (value.left.lineNumber > old_resp_header_length && value.left.lineNumber <= old_resp_body_length &&
                newSchema.response.body.filter((x:any)=>{ return x.includes(leftVal[0])}).length < 1) || 
                (nextArrayObjectBracket != null && value.left.lineNumber > nextArrayObjectBracket.originalLineNumber && value.left.lineNumber-nextArrayObjectBracket.deducter <= nextArrayObjectBracket.lineNumber)
            ){
              //resp 
              let newValue = value.left.lineNumber - oldSchema.request.header.length - oldSchema.request.body.length - oldSchema.response.header.length - 1;
              // console.log(newValue,value.left,"LEFT RESP-BODY",oldSchema.response.body[newValue])
              nextArrayObjectBracket= this.insertMissing(leftVal,leftTitle,newValue,nextArrayObjectBracket, oldSchema, missing, value.left.lineNumber, "Left-response-body",oldSchema.request.header.length + oldSchema.request.body.length + oldSchema.response.header.length + 1)
            }
          }
        } 
        if (value.left.value == undefined || flagDoubleObj){
          if (rightVal.length > 1){
            //missing right side
            if (nextArrayObjectBracket2 != null && (value.right.lineNumber-nextArrayObjectBracket2.deducter) >= nextArrayObjectBracket2.lineNumber ){
              nextArrayObjectBracket2 = null;
            }
            if(
              (value.right.lineNumber <= new_req_header_length && 
                oldSchema.request.header.filter((x:any)=>{ return x.includes(rightVal[0])}).length < 1) || 
                (nextArrayObjectBracket2 != null && value.right.lineNumber > nextArrayObjectBracket2.originalLineNumber && value.right.lineNumber-nextArrayObjectBracket2.deducter <= nextArrayObjectBracket2.lineNumber) 
            ){
              //req header
              nextArrayObjectBracket2= this.insertMissing(rightVal,leftTitle,value.right.lineNumber -1,nextArrayObjectBracket2, newSchema, missing, value.right.lineNumber, "Right-request-header",1)
              // console.log("RIGHT REQ-HEADER",newSchema.request.header[value.right.lineNumber -1])
            }else if (
              (value.right.lineNumber > new_req_header_length  && value.right.lineNumber <= new_req_body_length && 
                oldSchema.request.body.filter((x:any)=>{ return x.includes(rightVal[0])}).length < 1) || 
                (nextArrayObjectBracket2 != null && value.right.lineNumber > nextArrayObjectBracket2.originalLineNumber && value.right.lineNumber-nextArrayObjectBracket2.deducter <= nextArrayObjectBracket2.lineNumber) 
            ){
              //req body
              let newValue=value.right.lineNumber-newSchema.request.header.length -1;
              nextArrayObjectBracket2= this.insertMissing(rightVal,leftTitle,newValue,nextArrayObjectBracket2, newSchema, missing, value.right.lineNumber, "Right-request-body",newSchema.request.header.length +1)
              // console.log("RIGHT REQ-BODY",newSchema.request.body[value.right.lineNumber-newSchema.request.header.length -1])
            }else if (
              (value.right.lineNumber > new_req_body_length  &&value.right.lineNumber <= new_resp_header_length && 
                oldSchema.response.header.filter((x:any)=>{ return x.includes(rightVal[0])}).length < 1) || 
                (nextArrayObjectBracket2 != null && value.right.lineNumber > nextArrayObjectBracket2.originalLineNumber && value.right.lineNumber-nextArrayObjectBracket2.deducter <= nextArrayObjectBracket2.lineNumber) 
            ){
              // resp header
              let newValue=value.right.lineNumber-newSchema.request.header.length - newSchema.request.body.length -1;
              nextArrayObjectBracket2= this.insertMissing(rightVal,leftTitle,newValue,nextArrayObjectBracket2, newSchema, missing, value.right.lineNumber, "Right-response-header",newSchema.request.header.length + newSchema.request.body.length +1)
              // console.log("RIGHT RESP-HEADER",newSchema.response.header[value.right.lineNumber-newSchema.request.header.length - newSchema.request.body.length -1])
            }else if (
              (value.right.lineNumber > new_resp_header_length && value.right.lineNumber <= new_resp_body_length && 
                oldSchema.response.body.filter((x:any)=>{ return x.includes(rightVal[0])}).length < 1) || 
                (nextArrayObjectBracket2 != null && value.right.lineNumber > nextArrayObjectBracket2.originalLineNumber && value.right.lineNumber-nextArrayObjectBracket2.deducter <= nextArrayObjectBracket2.lineNumber) 
            ){
              //resp body
              let newValue = value.right.lineNumber - newSchema.request.header.length - newSchema.request.body.length - newSchema.response.header.length - 1;
              nextArrayObjectBracket2= this.insertMissing(rightVal,leftTitle,newValue,nextArrayObjectBracket2, newSchema, missing, value.right.lineNumber, "Right-response-body",newSchema.request.header.length + newSchema.request.body.length + newSchema.response.header.length + 1)
              // console.log(value.right,newValue,"RIGHT RESP-BODY",newSchema.response.body[newValue])
            }
          }
        }

      }
    })
    const getData = async () => {
      return Promise.all(missing[leftTitle].map((value:any)=> {
        return new Promise(async function(resolve,reject){
          value.children = value.children.filter( (value:any,index:any,self:any) => {
            return self.indexOf(value) === index
          })
          resolve(value)
        });
      }))
    }
  
    getData().then(data => {
      data.filter((value:any,index:any,self:any) => {
          return self.indexOf(value) == index
      })
      localStorage.setItem("missing",JSON.stringify(data))
    })

    const extraLines = this.props.extraLinesSurroundingDiff < 0
      ? 0
      : this.props.extraLinesSurroundingDiff;
      let skippedLines: number[] = [];
      return lineInformation.map(
        (line: LineInformation, i: number): JSX.Element => {
          const diffBlockStart = diffLines[0];
          const currentPosition = diffBlockStart - i;
          const diffNodes = splitView
            ? this.renderSplitView(line, i)
            : this.renderInlineView(line, i);
          if (currentPosition === extraLines && skippedLines.length > 0) {
            const { length } = skippedLines;
            skippedLines = [];
            return (
              <React.Fragment key={i}>
                {this.renderSkippedLineIndicator(
                  length,
                  diffBlockStart,
                  line.left.lineNumber,
                  line.right.lineNumber,
                )}
                {diffNodes}
              </React.Fragment>
            );
          }
          return diffNodes;
        },
      );
  }


  public render = (): JSX.Element => {
    const {
      schemaRequest,
      schemaResponse,
      oldValue,
      newValue,
      useDarkTheme,
      leftTitle,
      rightTitle,
      splitView,
    } = this.props;
    localStorage.setItem("headers","[]");
    localStorage.setItem("body","[]")
    if (typeof oldValue !== 'string' || typeof newValue !== 'string') {
      throw Error('"oldValue" and "newValue" should be strings');
    }
    // this.styles = this.computeStyles(this.props.styles, useDarkTheme);
    // const nodes = this.renderDiff().filter((val) => {
    //   return val != null;
    // });

    // this.setState({data:nodes,
    // current: nodes.slice(this.state.prev, this.state.next)
    // })

    const title = (leftTitle || rightTitle)
      && <tr>
        <td colSpan={splitView ? 3 : 5} className={this.styles.titleBlock}>
          <pre className={this.styles.contentText}>
            {leftTitle}
          </pre>
        </td>
        {splitView
          && <td colSpan={3} className={this.styles.titleBlock}>
            <pre className={this.styles.contentText}>{rightTitle}</pre>
          </td>
        }
      </tr>;
    return (
      <InfiniteScroll 
        dataLength={this.state.current.length}
        next={this.getMoreData}
        hasMore={this.state.hasMore}
        // style={{overflow:'hidden'}}
        loader={<h4>Loading...</h4>}
      >
        <table className={cn(this.styles.diffContainer, { [this.styles.splitView]: splitView })}>
          <tbody>
            {title}
            {/* {nodes} */}
              { this.state.current && this.state.current.map((item) => {
                  return item
              })

              }
          </tbody>
        </table>
       </InfiniteScroll>
    );
  };
}

export default DiffViewer;
export { ReactDiffViewerStylesOverride, DiffMethod };
