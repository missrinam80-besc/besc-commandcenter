'use client';
import { useEffect,useRef } from 'react';
export function F1Feedback({message,error=false}:{message:string;error?:boolean}){
 const ref=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{ref.current?.focus();},[message]);
 return <p ref={ref} tabIndex={-1} className={error?'error-note':'success'} role={error?'alert':'status'}>{message}</p>;
}
