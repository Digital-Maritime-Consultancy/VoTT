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

export interface ITag {
  tag: string;
  superpixelId: number;
  area: number;
}

const defaultOpacity = 0.1;
const annotatedOpacity = 0.7;
const annotatingOpacity = 0.9;
const defaultLineWidth = 0;
const highlightLineWidth = 2;
const canvasContainerId = "canvas-container";
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

export const exportToSvg = (canvasId: string, fileName: string, callback?: (fileName: string, content: string) => any) => {
    let fileNameSplit = fileName.split("/");
    let finalFileName = fileNameSplit[fileNameSplit.length - 1].split(".")[0] + ".svg";

    if (callback){
        const uri = "data:image/svg+xml;utf8,"+ prepare2Export(canvasId).outerHTML!;
        callback(finalFileName, uri);
    } else {
        console.log(prepare2Export(canvasId).outerHTML!);
    }
}

export const getSvgUrl = (canvasId:string, empty: boolean = false): string => {
    const content = prepare2Export(canvasId, empty).outerHTML!;
    var file = new Blob([content], { type: 'image/svg+xml' });
    return URL.createObjectURL(file);
}

interface SuperpixelCanvasProps {
    id: string, canvasWidth: number, canvasHeight: number, segmentationData: any,
     annotatedData: Annotation[], defaultColor: string, gridOn: boolean, svgName: string,
     onSegmentsUpdated: (...params: any[]) => void, onSelectedTagUpdated: (...params: any[]) => void,
     onCanvasLoaded: (...params: any[]) => void;
}

export const SuperpixelCanvas: React.FC<SuperpixelCanvasProps> = 
({id, canvasWidth, canvasHeight, segmentationData, annotatedData, defaultColor, gridOn, svgName,
     onSegmentsUpdated, onSelectedTagUpdated, onCanvasLoaded}) => {
    const [ loaded, setLoaded ] = useState(false);
    const [ gridReady, setGridReady ] = useState( false);
    const [ svgNotExist, setSvgNotExist ] = useState(false);
    const [ createdSvg, setCreatedSvg ] = useState(undefined);

    const onSVGLoaded = (data: any, test:any) => { 
        const s = Snap("#" + canvasContainerId);
        if (data.node.nodeName === 'svg'){  // load success
            if (s.select("path") === null){
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

    useEffect( () => {
        async function loadSVG(fileName: string) {
            await Snap.load(fileName, onSVGLoaded);
        };
        
        if (!loaded && !svgNotExist){
            loadSVG(svgName);
        }
        else if (!loaded && svgNotExist){
            setCreatedSvg(
                <CanvasSVGCreator id={id} canvasWidth={canvasWidth} canvasHeight={canvasHeight} segmentationData={segmentationData} 
                defaultColor={defaultColor} defaultOpacity={defaultOpacity} defaultLineWidth={defaultLineWidth} onCanvasSVGCreated={onCanvasSVGCreated} />);
        }
        else if (loaded && gridReady){
            var s = Snap("#" + id);
            if (s && s.selectAll("path").length){
                annotateCanvas(annotatedData, defaultColor, defaultOpacity, defaultLineWidth, annotatedOpacity);
                updateSVGEvent(canvasContainerId, id, defaultColor, defaultOpacity, annotatedOpacity, defaultLineWidth,
                    annotatingOpacity, highlightLineWidth, onSegmentsUpdated, onSelectedTagUpdated,);
                onCanvasLoaded();
            }
        }
    }, [loaded, svgNotExist, gridReady, createdSvg]);
    
    return (
        <div id={canvasContainerId} className={"img-overlay-wrap"}>
            { createdSvg }
            { loaded &&
                <CanvasGridProvider id={canvasGridId} canvasId={id} gridOn={gridOn}
                gridLineWidth={gridLineWidth} gridOpacity={gridOpacity} onGridReady={() => setGridReady(true)}/>}
        </div>);
}

export const getBoundingBox = (canvasId: string, ids: number[]) => {
    let pathString = "";
    ids.forEach( (id) => {const s = document.getElementById("sp"+id)!; pathString += (s.getAttribute("d") + " ") });
    const s = Snap("#"+canvasId);
    const path = s.path(pathString);
    const bbox = path.getBBox();
    path.remove();
    return { left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height };
}

export const clearCanvas = (canvasId: string, defaultcolor: string) => {
    const s = Snap("#"+canvasId);
    const paths = s.selectAll('path');
    paths.forEach(function(element: Snap.Set){
        const e = element.attr;
        element.attr({...e, name: AnnotationTag.EMPTY, tag: AnnotationTag.EMPTY, fill: defaultcolor, style: `stroke-width: ${defaultLineWidth}; opacity: ${defaultOpacity};`,});
    }, this);
}

