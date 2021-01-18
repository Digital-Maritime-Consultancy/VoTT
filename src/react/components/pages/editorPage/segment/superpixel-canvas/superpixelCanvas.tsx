import { clear } from "console";
import { ISegment, ITag } from "../../../../../../models/applicationState";
import { ExtendedSelectionMode } from "../../editorPage";
import { annotateCanvas } from "./canvasAnnotator";
import { updateSVGEvent } from "./canvasEventLinker";
import { CanvasGridProvider } from "./canvasGridProvider";
import { CanvasSVGCreator } from "./canvasSVGCreator";

const React = require("react");
const { useState, useEffect } = require("react");
const Snap = require("snapsvg-cjs");
const svgToPng = require("save-svg-as-png");

export enum AnnotationTag{
  EMPTY = "empty",
  DEANNOTATING = "deannotating",
}

const defaultOpacity = 0.1;
const annotatedOpacity = 0.7;
const annotatingOpacity = 0.9;
const defaultLineWidth = 0;
const highlightLineWidth = 2;
const canvasContainerId = "editor-zone";
const canvasGridId = "canvas-grid";
const gridLineWidth = 0.5;
const gridOpacity = 0.8;

export interface IPoint{
    x: number,
    y: number,
}

export interface IAnnotation{
    tag: string,
    color: string,
    index?: number,
}

export interface ICoordinates{
    gridWidth: number, 
    gridHeight: number, 
    canvasWidth: number, 
    canvasHeight: number,
}

export class Annotation implements IAnnotation {
    tag: string
    color: string
    index?: number

    constructor(tag: string, color: string, index?:number){
        this.tag = tag;
        this.color = color;
        this.index = index;
    }
}

export const updateAnnotating = (canvasId: string, tag: string, color:string) => {
    document.getElementById(canvasId).setAttribute("name", color);
    document.getElementById(canvasId).setAttribute("color-profile", tag);
  }

export const number2SPId = (id: number): string => {
    return "sp" + id.toString();
}

export const SPId2number = (spId: string): number => {
    return spId.startsWith("sp") ? parseInt(spId.substr(2)) : -1;
}

export const getSegmentsFromSvg = (canvasId: string): ISegment[] => {
    const s = Snap("#"+canvasId);
    if (!s) {
        return [];
    }
    const paths = s.selectAll('path');
    let segments: { [id: string] : ISegment; } = {};
    paths.forEach((element: Snap.Set) => {
        if (element.attr('tag') !== AnnotationTag.EMPTY){
            const tag = element.attr('tag');
            if (segments[tag] ){
                segments[tag].area += parseInt(element.attr('area'));
                segments[tag].superpixel.push(SPId2number(element.attr('id')));
            }
            else {
                segments[tag] = {id: '', 
                    tag: tag,
                    superpixel: [SPId2number(element.attr('id'))],
                    area: parseInt(element.attr('area')),
                    boundingBox: undefined,
                    iscrowd: 0,
                    risk: "safe"};
            }
        }
    }, this);

    const segmentsArray = Object.values(segments);
    segmentsArray.forEach( (e) => e.boundingBox = getBoundingBox(canvasId, e.superpixel));
    return segmentsArray;
}

const configureSvg = (svgElement: HTMLElement, empty: boolean) => {
    const svg: Element = svgElement.firstElementChild;
    const children = svg.children;
    for (var i=0; i< children.length ; i++){
        if ( empty ){
            children[i].setAttribute("fill", "#000000");
            children[i].setAttribute("tag", "empty");
            children[i].setAttribute("name", "empty");
            children[i].setAttribute("style", `stroke-width: 0; opacity: ${defaultOpacity};`);
        }else{
            children[i].setAttribute("style", "stroke-width: 0; opacity: 1;");
        }
    }
    return svg;
}

const prepare2Export = (canvasId: string, empty: boolean = false) => {
    const newElement = document.createElement("exportSvg");
    const clonedNode = document.getElementById(canvasId).cloneNode(true);
    newElement.appendChild(clonedNode);
    return configureSvg(newElement, empty);
}

export const exportToPng = (canvasId: string, fileName: string, backgroundColor: string = "#000000", callback?: (fileName: string, content: string) => any) => {
    let fileNameSplit = fileName.split("/");
    let finalFileName = fileNameSplit[fileNameSplit.length - 1].split(".")[0] + ".png";

    if (callback){
        svgToPng.svgAsPngUri(prepare2Export(canvasId),
        finalFileName, {backgroundColor: backgroundColor}).then((uri: string) => callback(finalFileName, uri));
    } else {
        svgToPng.saveSvgAsPng(prepare2Export(canvasId), finalFileName, {backgroundColor: backgroundColor})
    }
}

export const exportToSvg = (canvasId: string, fileName: string,
    callback?: (fileName: string, content: string) => any) => {
    let fileNameSplit = fileName.split("/");
    let finalFileName = fileNameSplit[fileNameSplit.length - 1].split(".")[0] + ".svg";

    if (callback){
        const uri = "data:image/svg+xml;utf8,"+ prepare2Export(canvasId).outerHTML!;
        callback(finalFileName, uri);
    } else {
        console.log(prepare2Export(canvasId).outerHTML!);
    }
}

export const getSvgContent = (canvasId: string) => {
    return prepare2Export(canvasId).outerHTML!;
}

export const getSvgUrl = (canvasId: string, empty: boolean = false): string => {
    const content = prepare2Export(canvasId, empty).outerHTML!;
    var file = new Blob([content], { type: 'image/svg+xml' });
    return URL.createObjectURL(file);
}

interface SuperpixelCanvasProps {
    id: string, annotating: ITag, 
     annotatedData: Annotation[], defaultColor: string, gridOn: boolean, svgName: string,
     getCurrentMode: () => ExtendedSelectionMode, onCanvasUpdated: (...params: any[]) => void,
}

export const getAnnotatingTag = (canvasId: string): ITag => {
    const svg = document.getElementById(canvasId);
    return svg ? { name: svg.getAttribute("color-profile"),  color: svg.getAttribute("name") } : undefined;
}

export const SuperpixelCanvas: React.FC<SuperpixelCanvasProps> = 
({id, annotating, annotatedData, defaultColor, gridOn, svgName, getCurrentMode, onCanvasUpdated}) => {
    const [ loaded, setLoaded ] = useState(false);
    const [ loadedSvgName, setLoadedSvgName ] = useState("");
    const [ gridReady, setGridReady ] = useState( false);
    const [ svgNotExist, setSvgNotExist ] = useState(false);
    const [ createdSvg, setCreatedSvg ] = useState(undefined);

    const onSVGLoaded = (data: any, test:any) => { 
            const s = Snap("#" + canvasContainerId);
            if (data.node.nodeName === 'svg'){  // load success
                if (s && s.select("path") === null){
                    s.append( data );
                    setLoaded(true);
                }
            }
            else{
                setSvgNotExist(true);
            }
    }

    const onCanvasSVGCreated = () => {
        setLoaded(true);
    }

    const removeSvgElements = () => {
        const s = Snap("#" + id);
        if (s) {
            s.remove();
        }
    }

    const initializeCanvas = (annotating?: ITag) => {
        clearAnnotating(id, defaultColor, annotating);
        const s = Snap("#"+id);
        const paths = s.selectAll('path');
        paths.forEach(function(element: Snap.Set){
            const e = element.attr;
            if (element.attr('tag') === AnnotationTag.EMPTY){
                element.attr({...e, 
                    style: `stroke-width: ${defaultLineWidth}; opacity: ${defaultOpacity};`,});
            }
            else{
                element.attr({...e, 
                    style: `stroke-width: ${defaultLineWidth}; opacity: ${annotatedOpacity};`,});
            }
        }, this);
    }

    useEffect( () => {
        async function loadSVG(fileName: string) {
            await Snap.load(fileName, onSVGLoaded);
            setLoadedSvgName(fileName);
        };
        
        if (!loaded && !svgNotExist){
            loadSVG(svgName);
        }
        else if (!loaded && svgNotExist){
            console.log("svg does not exist!");
        }
        else if (loaded) {
            if (loadedSvgName.length && loadedSvgName !== svgName){
                removeSvgElements();
                setLoaded(false);
            } else {
                if (gridReady) {
                    let s = Snap("#" + id);
                    if (s && s.selectAll("path").length){
                        initializeCanvas(annotating);
                        updateSVGEvent(canvasContainerId, id, defaultColor, defaultOpacity, annotatedOpacity, defaultLineWidth,
                            annotatingOpacity, highlightLineWidth, getCurrentMode, onCanvasUpdated,);
                    }
                }
            }
        } 
    }, [loaded, svgNotExist, gridReady, annotatedData]);

    return (
        <div id={canvasContainerId} className={"full-size img-overlay-wrap"}>
            { createdSvg }
            { loaded &&
                <CanvasGridProvider id={canvasGridId} canvasId={id} gridOn={gridOn}
                gridLineWidth={gridLineWidth} gridOpacity={gridOpacity} onGridReady={() => setGridReady(true)}/>}
        </div>);
}

const arrayMin = (arr) => {
    var len = arr.length, min = Infinity;
    while (len--) {
      if (arr[len] < min) {
        min = arr[len];
      }
    }
    return min;
  };
  
const arrayMax = (arr) => {
    var len = arr.length, max = -Infinity;
    while (len--) {
      if (arr[len] > max) {
        max = arr[len];
      }
    }
    return max;
  };

export const getBoundingBox = (canvasId: string, ids: number[]) => {
    let min_x= 99999;
    let max_x= 0;
    let min_y= 99999;
    let max_y= 0;
    ids.forEach( (id) => {
        const s = document.getElementById("sp"+id)!; 
        const filtered = s.getAttribute("d").split(' ').filter((e) => (e !== "M" && e!== 'L' && e!=='Z')).map(Number);
        const x = filtered.filter((a,i)=>i%2===0);
        const y = filtered.filter((a,i)=>i%2===1);
        const calMaxX = arrayMax(x);
        const calMaxY = arrayMax(y);
        const calMinX = arrayMin(x);
        const calMinY = arrayMin(y);
        max_x = max_x >= calMaxX ? max_x : calMaxX;
        min_x = min_x <= calMinX ? min_x : calMinX;
        max_y = max_y >= calMaxY ? max_y : calMaxY;
        min_y = min_y <= calMinY ? min_y : calMinY;
    });
    return {left: min_x, top: min_y, width: max_x - min_x, height: max_y - min_y};
}

export const clearCanvas = (canvasId: string, defaultColor: string) => {
    clearAnnotating(canvasId, defaultColor);
    const s = Snap("#"+canvasId);
    const paths = s.selectAll('path');
    paths.forEach(function(element: Snap.Set){
        const e = element.attr;
        element.attr({...e, name: AnnotationTag.EMPTY, tag: AnnotationTag.EMPTY, fill: defaultColor,
            style: `stroke-width: ${defaultLineWidth}; opacity: ${defaultOpacity};`,});
    }, this);
}

const clearAnnotating = (canvasId: string, defaultColor: string, annotating?: ITag) => {
    const dom = document.getElementById(canvasId);
    if (annotating) {
        dom.setAttribute("color-profile", annotating.name);
        dom.setAttribute("name", annotating.color);
    } else {
        dom.setAttribute("color-profile", AnnotationTag.EMPTY);
        dom.setAttribute("name", defaultColor);
    }
}