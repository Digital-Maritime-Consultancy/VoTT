import { ISegmentOffset } from "../../../../../../models/applicationState";
import { ExtendedSelectionMode } from "../../editorPage";
import { AnnotationTag, SPId2number, } from "./superpixelCanvas";
const Snap = require("snapsvg-cjs");

export const updateSVGEvent = (canvasContainerId: string, canvasId: string, defaultColor: string,
    defaultOpacity: number, annotatedOpacity: number, defaultLineWidth: number, annotatingOpacity: number, highlightLineWidth: number,
    getCurrentMode: () => ExtendedSelectionMode, onCanvasUpdated: (...params: any[]) => void) => {
    const s = Snap("#" + canvasContainerId);
    const elements = s.selectAll("path");
    elements.forEach((superpixel: any) => {
        return configureSuperpixelEvent(canvasId, superpixel, defaultColor, defaultOpacity,
            annotatedOpacity, defaultLineWidth, annotatingOpacity, highlightLineWidth, getCurrentMode, onCanvasUpdated);
    });
}

const clearSuperpixel = (snapElement: Snap.Paper, defaultcolor: string, area: number, 
        defaultOpacity: number, annotatedOpacity: number, defaultLineWidth: number) => {
    paintSuperpixel(snapElement, AnnotationTag.DEANNOTATING, defaultcolor, area, defaultOpacity, annotatedOpacity, defaultLineWidth);
}

const updateSuperpixelSVG = (component: Snap.Element, fill: string, opacity: number, strokeWidth: number, tag?: string, color?: string ) => {
    if (tag && color){
        component.attr({...component.attr, fill, opacity, strokeWidth, tag, name: color,});
    }
    else{
        component.attr({...component.attr, fill, opacity, strokeWidth, });
    }
}

const paintAndUpdateState = (event: MouseEvent, superpixel: any, annotatingTag: string, fillColor: string, defaultcolor: string, defaultOpacity: number, annotatedOpacity: number, defaultLineWidth: number) => {
    if(event.buttons === 1 && annotatingTag !== AnnotationTag.EMPTY){
        paintSuperpixel(superpixel, annotatingTag, fillColor, parseInt(superpixel.attr()["area"]), defaultOpacity, annotatedOpacity, defaultLineWidth);
    }
    else if(event.buttons === 2 && annotatingTag !== AnnotationTag.EMPTY){ // removing
        clearSuperpixel(superpixel, defaultcolor, parseInt(superpixel.attr()["area"]), defaultOpacity, annotatedOpacity, defaultLineWidth); // area should be updated
    }
};

let clicked = false;

export const paintSuperpixel =
        (snapElement: Snap.Paper, tag: string, color: string, area: number,
            defaultOpacity: number, annotatedOpacity: number, defaultLineWidth: number) => {
    if (tag === AnnotationTag.EMPTY || color === AnnotationTag.EMPTY) {
        return ;
    }
    if (snapElement){
        const coloringTag = tag === AnnotationTag.DEANNOTATING ? AnnotationTag.EMPTY : tag;
        updateSuperpixelSVG(snapElement, color, coloringTag === AnnotationTag.EMPTY ? defaultOpacity : annotatedOpacity,
            defaultLineWidth, coloringTag, tag === AnnotationTag.DEANNOTATING ? AnnotationTag.EMPTY : color);
    }
    else{
        console.log("ERROR: a superpixel was not able to find!");
    }
}

const configureSuperpixelEvent = (canvasId: string, superpixel: any, defaultColor: string,
    defaultOpacity: number, annotatedOpacity: number, defaultLineWidth: number, annotatingOpacity: number, highlightLineWidth: number,
    getCurrentMode: () => ExtendedSelectionMode, onCanvasUpdated: (...params: any[]) => void
    ) => {
        superpixel.mouseover( (event: MouseEvent) => {
            if (event.buttons > 0 || getCurrentMode() === ExtendedSelectionMode.NONE ) { return ; }
            const annotatingTag = document.getElementById(canvasId).getAttribute("color-profile");
            const currentColor = superpixel.attr().name;
            const fillColor = document.getElementById(canvasId).getAttribute("name")!;
            if( annotatingTag !== AnnotationTag.EMPTY ){
                document.getElementById(canvasId).setAttribute("content-script-type", currentColor); // storing color
                updateSuperpixelSVG(superpixel,
                    annotatingTag === AnnotationTag.DEANNOTATING ? defaultColor : fillColor,
                    annotatingTag === AnnotationTag.DEANNOTATING ? defaultOpacity : annotatingOpacity,
                    highlightLineWidth);
                }
            })
            .mouseout( (event: MouseEvent) => {
                if (event.buttons > 0 || getCurrentMode() === ExtendedSelectionMode.NONE) { return ; }
                const annotatingTag = document.getElementById(canvasId).getAttribute("color-profile");
                const currentColor = superpixel.attr().name;
                if(annotatingTag !== AnnotationTag.EMPTY){
                    const backupColor: string = document.getElementById(canvasId).getAttribute("content-script-type")!;
                    updateSuperpixelSVG(superpixel,
                        backupColor === AnnotationTag.EMPTY ? defaultColor : backupColor,
                        currentColor === AnnotationTag.EMPTY ? defaultOpacity : annotatedOpacity,
                        ? defaultOpacity : annotatedOpacity,
                        defaultLineWidth);
                }
            })
            .mousemove( (event: MouseEvent) => {
                if ( getCurrentMode() === ExtendedSelectionMode.NONE ) { return ; }
                const annotatingTag = superpixel.parent().attr()["color-profile"];
                const fillColor: string = superpixel.parent().attr()["name"];
                paintAndUpdateState(event, superpixel, annotatingTag, fillColor, defaultColor, defaultOpacity, annotatedOpacity, defaultLineWidth);
            })
            .mousedown( (event: MouseEvent) => {
                clicked = true;
                if ( getCurrentMode() === ExtendedSelectionMode.NONE ) { return ; }
                const annotatingTag = superpixel.parent().attr()["color-profile"];
                const fillColor: string = superpixel.parent().attr()["name"];
                paintAndUpdateState(event, superpixel, annotatingTag, fillColor, defaultColor, defaultOpacity, annotatedOpacity, defaultLineWidth);
                event.buttons === 2 ? superpixel.parent().attr({...superpixel.parent().attr(), "content-script-type": defaultColor})
                 : superpixel.parent().attr({...superpixel.parent().attr(), "content-script-type": fillColor}) // storing color
            })
            .mouseup( (event: MouseEvent) => {
                if (clicked){
                    const tag: string = superpixel.attr()["tag"];
                    onCanvasUpdated(tag);
                }
                clicked = false;
            }).drag( () => false, ()=>false, ()=>false);
    return superpixel;
}