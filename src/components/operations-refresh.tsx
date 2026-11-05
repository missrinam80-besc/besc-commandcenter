"use client";
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
export function OperationsRefresh(){const router=useRouter();useEffect(()=>{const timer=setInterval(()=>router.refresh(),60000);return()=>clearInterval(timer);},[router]);return null;}
