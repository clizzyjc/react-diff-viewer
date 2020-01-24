// require('./style.scss');
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import ReactDiff, { DiffMethod } from '../../lib/index';

const oldJs = require('./diff/javascript/old.rjs').default;
const newJs = require('./diff/javascript/new.rjs').default;

const logo = require('../../logo.png');

interface ExampleState {
  content1: string;
  content2: string;
  splitView?: boolean;
  highlightLine?: string[];
  language?: string;
  listoferrors: { property: string , instance: string};
  enableSyntaxHighlighting?: boolean;
  compareMethod?: DiffMethod;
}

const P = (window as any).Prism;

class Example extends React.Component<{}, ExampleState> {
  public constructor(props: any) {
    super(props);
    this.state = {
      content1: null,
      content2: null
    };
  }

  getFile = (target: any,state : any) => {
    const input = target;
    // this.setState({
    //   [`${state}title`]: target.value.replace(/^.*[\\\/]/, '')
    // })   
    if ('files' in input && input.files.length > 0) {
      this.placeFileContent(
        state,
        input.files[0])
    }
  };
  
  placeFileContent= (state: any, file: any) =>{
    this.readFileContent(file).then( (content:string) => {
      while(content.includes('RAW Re')) {
        var temp = content.substring(content.indexOf("RAW Re"), content.indexOf("----------------------------------------------------",content.indexOf("RAW Re")+1)+52);
        content = content.replace(temp,"");
      }
      this.setState({
        [`${state}`] : content,
      })
    }).catch(error => console.log(error))

  };
  
  readFileContent = (file: any) => {
    const reader = new FileReader()
    return new Promise((resolve, reject) => {
      reader.onload = event => resolve(event.target.result)
      reader.onerror = error => reject(error)
      reader.readAsText(file)
    })
  };

  clickButton = () =>{
    this.getFile(document.getElementById('file1'),'content1');
    this.getFile(document.getElementById('file2'),'content2');
  };;

  // downloadCapture = () => {
  //   const htmlDocStr = capture(OutputType.STRING);
  //   var bl = new Blob([htmlDocStr], {type: "text/html"});
  //   var a = document.createElement("a");
  //   a.href = URL.createObjectURL(bl);
  //   a.download = "Comparison.html";
  //   a.hidden = true;
  //   document.body.appendChild(a);
  //   a.innerHTML = "something random - nobody will see this, it doesn't matter what you put here";
  //   a.click();
  // };
  public render(): JSX.Element {
    const newStyles = {
      variables: {
        highlightBackground: '#fefed5',
        highlightGutterBackground: '#ffcd3c',
      },
      // line: {
      //   padding: '10px 2px',
      //   '&:hover': {
      //     background: '#a26ea1',
      //   },
      // },
      line: {
        wordBreak: 'break-word',
      },
    };
    return (
      <React.Fragment>
        <div>
      {/* <Layout style={{padding: 30, paddingBottom: 20}}> */}
      {/* <Row>
        <Col span={14} offset={4}> */}
        <label>Upload file 1 : </label>
        <input type="file" accept=".txt" id="file1"  name="file1"/>

        <label>Upload file 2 : </label>
        <input type="file" accept=".txt" id="file2"  name="file2"/>

        <label>select API : </label>
        <select id = "selectID">
        <option value="subscription">Subscription</option>
        <option value="termination">Termination</option>
        <option value="instantiation">Instantiation</option>
        <option value="others">Others</option>
        </select>

        {/* </Col> */}
      <br/>
      <button onClick={this.clickButton}>Click me</button>

      {/* </Row> */}
       {/* <Row style={{marginTop: 30}}> */}
           {/* <Col span={12} offset={8}> */}
             {/* <Button type="primary" icon="check" id="diff" onClick={this.clickButton} style={{marginRight:50}} size="small">Check difference</Button> */}
             {/* <Button type="primary" onClick={this.downloadCapture} icon="download" size="small"> */}
               {/* Download HTML */}
             {/* </Button> */}
           {/* </Col> */}
       {/* </Row> */}
       {/* <Row style={{marginTop: 10}}> */}
         {/* <Col span={10} offset={6}> */}
          <p id="errorID">Errors: - </p>
          <p id="messageID">Message: </p>
         {/* </Col> */}
       {/* </Row> */}
      <br/>
       {/* <Row> */}
           {/* <Col span={24}> */}
            { this.state.content1 &&this.state.content2 && <ReactDiff
                styles={newStyles}
                oldValue={this.state.content1}
                newValue={this.state.content2}
                splitView={true}
                showDiffOnly={false}
                useDarkTheme={false}
              />
            }
             
         {/* </Col> */}
       {/* </Row> */}
       {/* </Layout> */}
    </div>
    </React.Fragment>
    );
  }
}

ReactDOM.render(<Example />, document.getElementById('app'));
