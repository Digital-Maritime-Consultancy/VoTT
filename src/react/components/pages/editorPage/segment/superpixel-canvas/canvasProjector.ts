import { ISegment } from "../../../../../../models/applicationState";
import { Annotation, AnnotationTag, number2SPId } from "./superpixelCanvas";
const Snap = require("snapsvg-cjs");

export const projectCanvas = (svg: any, segments: ISegment[] ) => {
    const result = [];
    const s = Snap(svg.node);
    segments.forEach( (segment) => {
        const newArr = [];
        segment.superpixel.forEach( (superpixel) =>
            { const t = s.select("#sp"+superpixel);
              const arr = t.attr("d").split(/[\sMLZ]+/).filter( (e) => e.length ).map((e) => +e);
            while(arr.length) newArr.push(arr.splice(0,2)); });
        result.push(newArr);
    });
    return result;
}