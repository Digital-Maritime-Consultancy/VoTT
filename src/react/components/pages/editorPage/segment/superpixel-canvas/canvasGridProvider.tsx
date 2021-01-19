import { useEffect } from "react";

const React = require("react");

interface CanvasGridProviderProps {
    id: string, canvasId: string, gridOn: boolean, gridLineWidth: number, gridOpacity: number, onGridReady: (...params: any[]) => void;
}

// here we will intentionally not use Snap svg because of its cloning including event listeners
export const CanvasGridProvider: React.FC<CanvasGridProviderProps> = 
({id, canvasId, gridOn, gridLineWidth, gridOpacity, onGridReady}) => {

    const containerId = id + "Container";

    const configureGrid = (canvasId: string, id: string, lineWidth: number, opacity: number) => {
        const grid = document.getElementById(canvasId).cloneNode(true);
        document.getElementById(containerId).append(grid!);
        document.getElementById(containerId).firstElementChild.setAttribute("id",id);
        document.getElementById(containerId).firstElementChild.setAttribute("class","img-grid");
        document.getElementById(containerId).firstElementChild.removeAttribute("color-profile");
        document.getElementById(containerId).firstElementChild.removeAttribute("content-script-type");
        document.getElementById(containerId).firstElementChild.removeAttribute("name");
        const children = document.getElementById(id).children;
        for (var i=0; i<children!.length ; i++){
            if ( children![i].tagName === "path") {
                children![i].setAttribute("id" , children![i].getAttribute("id") + "_grid");
                children![i].setAttribute("fill-opacity", "0");
                children![i].setAttribute("opacity", opacity.toString());
                children![i].setAttribute("stroke-width" , lineWidth.toString());
                children![i].removeAttribute("style");
            }
        }
    }

    const getGrid = () => {
        if (gridOn && !document.getElementById(containerId).hasChildNodes()){
            configureGrid(canvasId, id, gridLineWidth, gridOpacity);
        }
        else{
            const parent = document.getElementById(containerId);
            while (parent.firstChild) {
                parent.firstChild.remove();
            }
        }
    }

    useEffect( () => {
        getGrid();
        onGridReady();
    }, [gridOn]);

    return (<div id={containerId} className={"img-grid"}></div>);
}