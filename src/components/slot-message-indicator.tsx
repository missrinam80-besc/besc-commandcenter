import {Check, Clock, TriangleAlert, ShieldCheck, Inbox, CalendarCheck, CalendarX, X} from "lucide-react";

const kinds = {verify: {label:"Verificatie",icon:ShieldCheck},pending:{label:"Aanvraag",icon:Inbox},confirmed:{label:"Bevestiging",icon:CalendarCheck},rejected:{label:"Afwijzing",icon:X},cancelled:{label:"Annulering",icon:CalendarX}};
const states:Record<string,string> = {queued:"ingepland",leased:"in verwerking",dispatching:"wordt verzonden",sent:"verzonden",failed:"mislukt",uncertain:"verzending onzeker; controleer het verzendkanaal"};

export function SlotMessageIndicator({kind,state}:{kind:string;state:string}) {
  const definition=kinds[kind as keyof typeof kinds];
  const Icon=definition?.icon??Inbox;
  const tone=state==="sent"?"success":["queued","leased","dispatching"].includes(state)?"waiting":"error";
  const StatusIcon=tone==="success"?Check:tone==="waiting"?Clock:TriangleAlert;
  const label=`${definition?.label??"Bericht"}: ${states[state]??"onbekende status; controleer het verzendkanaal"}`;
  return <span className={`slot-message-indicator slot-tone-${tone}`} tabIndex={0} role="img" aria-label={label}>
    <Icon size={17} aria-hidden="true"/><StatusIcon className="slot-message-state-icon" size={10} aria-hidden="true"/>
    <span className="slot-message-tooltip" aria-hidden="true">{label}</span>
  </span>;
}
