import 'server-only';
import {CreatorYouTubeKernel} from './creator-youtube-kernel';
import {CreatorYouTubeOAuthAttempt,type CreatorAttemptCipher,type CreatorAttemptStore} from './creator-youtube-oauth-attempt';
import {CreatorYouTubeProviderInbox} from './creator-youtube-provider-inbox';
import {CreatorYouTubeUserFlow} from './creator-youtube-user-flow';
import type {CreatorYouTubeGoogle} from './creator-youtube-google';
import type {CreatorYouTubeSession} from './creator-youtube-session';

export function createCreatorYouTubeApplication(input:{session:CreatorYouTubeSession;google:CreatorYouTubeGoogle;attempts:CreatorAttemptStore;receipts:CreatorAttemptStore;cipher:CreatorAttemptCipher;origin:string;now?:()=>number},enabled=false){
 const kernel=new CreatorYouTubeKernel({owner:input.session.owner,server:input.session.server,provider:input.google},enabled);
 const inbox=new CreatorYouTubeProviderInbox(input.receipts,input.cipher,enabled);
 const attempts=new CreatorYouTubeOAuthAttempt({kernel,store:input.attempts,responses:inbox,principal:()=>input.session.principal(),now:input.now??Date.now},input.cipher,input.origin+'/auth/creator-youtube/callback',enabled);
 return new CreatorYouTubeUserFlow({authenticate:()=>input.session.authenticate(),kernel,attempts,google:input.google,account:after=>input.session.account(after),read:link=>input.session.read(link)},input.origin,enabled);
}
