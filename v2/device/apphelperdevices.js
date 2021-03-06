import { AppHelperBase } from "../apphelperbase.js";
import { ControlDevices } from "./controldevice.js";
import { ControlCommands } from "../command/controlcommand.js";
import { ControlDebug } from "../debug/controldebug.js";
import { ApiServer } from "../api/apiserver.js";
import { EventBus } from "../eventbus.js";
import { UtilDOM } from "../utildom.js";
import { GCMLocalNetworkTest,GCMWebSocketRequest } from "../gcm/gcmapp.js";
import { App } from "../app.js";
import { SenderLocal } from "../api/sender.js";
import { Devices } from "./device.js";

/** @type {App} */
let app = null;
export class AppHelperDevices extends AppHelperBase{
    constructor(args = {app,allowUnsecureContent}){
        super(args.app);
        app = args.app;
        this.allowUnsecureContent = args.allowUnsecureContent;
    }
    async load(){
        app.controlTop.loading = true;
        app.controlTop.shouldAlwaysShowImageRefresh = true;
        this.onRequestLoadDevicesFromServer = async()=>{
            await this.loadDevicesFromServer();
        }
        EventBus.registerSticky(this);
        EventBus.register(this);
        app.controlTop.appName = `Join`;
        app.controlTop.appNameClickable = false;
        const devices = await app.devicesFromDb;
        
        this.controlDevices = new ControlDevices(devices);
        await app.addElement(this.controlDevices);
        this.controlDevices.hideNoDevices();

        this.controlCommands = new ControlCommands({hideSendTab:app.hideSendTabCommand});
        await app.addElement(this.controlCommands);
        if(devices.length == 0){
            UtilDOM.hide(this.controlCommands);
        }    
  
        app.controlTop.loading = false;

    }
    updateUrl(){
        Util.changeUrl(`?devices`);
    }
    async updateDBDevices(devices){
        await app.setDevices(devices);
    } 
    async updateDBDevice(device){
        await app.updateDevice(device);
    } 
    async loadDevicesFromServer(){
        app.controlTop.loading = true;        
        await app.loadJoinApis();
        const devices = new Devices(await ApiServer.getDevices());
        const existing = await this.getDevices();
        if(existing){
            existing.transferSockets(devices);
        }
        await this.refreshDevices(devices);
        await this.updateDBDevices(devices);
        if(devices.length > 0){
            UtilDOM.show(this.controlCommands);
        }
        await devices.testLocalNetworkDevices({allowUnsecureContent:app.allowUnsecureContent,token:await app.getAuthToken()});
        await this.refreshDevices(devices);
        app.controlTop.loading = false;
        
        // await app.checkConnectedClients();
        EventBus.post(devices);
        return devices;
    }
    async onRequestPushFiles(request){
        const files = request.files;
        if(!files) return;

        const device = request.device || this.selectedDevice
        const token = await app.getAuthToken();
        await device.pushFiles({files,token});
    }
    async refreshDevices(devices){
        if(!this.controlDevices) return;
        
        if(!devices){
            devices = await this.getDevices()
        }
        this.controlDevices.devices = devices;
        
        await this.controlDevices.render();
        return true;
    }
    
    async getDevice(deviceId){
        const devices = await this.getDevices();
        
        return devices.getDevice(deviceId);
    }
    async getDevices(){
        const devicesFromControl = this.controlDevices.devices;
        if(devicesFromControl) return devicesFromControl;

        var devices = await app.devicesFromDb;
        if(!devices || devices.length == 0){
            devices = await this.loadDevicesFromServer();
        }
        return devices;     
    }
    async onRequestToggleShowApiBuilder(){
        if(!this.apiBuilder){
            const ControlApiBuilder = (await import('../api/builder/controlapibuilder.js')).ControlApiBuilder
            this.apiBuilder = new ControlApiBuilder(this.selectedDevice);
            await app.addElement(this.apiBuilder);
        }
        if(this.selectedDevice != this.apiBuilder.device){
            await UtilDOM.show(this.apiBuilder);
        }else{            
            await UtilDOM.toggleShow(this.apiBuilder);
        }
        this.apiBuilder.device = this.selectedDevice;
    }
    async onRequestShowApiKey(){
        this.apiBuilder.generateUrl(await this.apiKey);
    }
    async confirmApiKeyDelete(){
        const forReals = confirm("If you do this all requests that you have already setup that use this key will no longer work!\n\nAre you sure you want to reset your API Key?");
        if(!forReals) return false;

        return true;
    }
    async onRequestResetApiKey(){
        try{
            if(!this.confirmApiKeyDelete()) return;

            this._apiKey = await ApiServer.resetApiKey();   
            app.showToast({text:`API Key reset!`});
            await this.apiBuilder.generateUrl(await this.apiKey);
        }catch(error){
            app.showToast({text:`Couldn't reset API key: ${error}`,isError:true});
        }
    }
    async onRequestDeleteApiKey(){
        try{
            if(!this.confirmApiKeyDelete()) return;
            await ApiServer.deleteApiKey();
            this._apiKey = null;
            await this.apiBuilder.generateUrl(null);
            app.showToast({text:`API Key deleted!`});
        }catch(error){
            app.showToast({text:`Couldn't delete API key: ${error}`,isError:true});
        }
    }
    get apiKey(){
        return (async ()=>{
            if(!this._apiKey){
                this._apiKey = await ApiServer.getApiKey(); 
                console.log("Got key!",this._apiKey);               
            }
            return this._apiKey;
        })();
    }
    get selectedDevice(){
        if(!this.controlDevices) return;

        const controlDevice = this.controlDevices.getSelectedDevice();
        if(!controlDevice) return;

        return controlDevice.device;
    }

    async openMenuEntry(request,menuEntry){
        const device = request.device;
        const args = await menuEntry.load(device.deviceId);
        menuEntry.args = args;
        await EventBus.post(menuEntry)
        menuEntry.args = null;
        // app.selectMenuEntry({menuEntry,args});
    }
    async onRequestOpenSms(request){
        await this.openMenuEntry(request,app.menuEntrySms);
    }
    async onRequestOpenFileBrowser(request){
        await this.openMenuEntry(request,app.menuEntryFiles);
    }
    async onRequestOpenPushHistory(request){
        await this.openMenuEntry(request,app.menuEntryPushHistory);
    }
    async onRequestOpenNotifications(request){
        await this.openMenuEntry(request,app.menuEntryNotifications);
    }
    async onRequestRefreshDevices(request){
        await this.refreshDevices(request.devices);
    }
    async onSelectedDevice(selectedDevice){
        if(!selectedDevice.wasClick) return;

        const controlDevice = selectedDevice.controlDevice;
        if(!controlDevice) return;

        const device = controlDevice.device;

        if(this.apiBuilder){
            this.apiBuilder.device = device;
        }
        
        if(!device.hasFixableIssue) return;

        var serverAddress = device.tentativeLocalNetworkServerAddress;
        if(!serverAddress) return;

        serverAddress += `acceptcertificate?token=${await app.getAuthToken()}`
        const name = device.deviceName;
        const wantAcceptCertificate = confirm(`${name} can be contacted via local network but you have to accept an unsafe https certificate that originates from the Android Join app.\n\nIf you do, you can then communicate with ${name} via your local network.\n\nWant to do that now?`)
        if(!wantAcceptCertificate) return;

        await Util.openWindow(serverAddress);
        try{
            await Util.sleep(1000);
            await Util.withTimeout(UtilDOM.waitForWindowFocus(),60000);        
            device.testLocalNetwork();
        }catch{
            console.error("Timed out while waiting for user to accept certificate")
        }
    }
    async onRequestUpdateDevice(request){
        await this.refreshDevices();
    }
    
    
    async onRequestRefresh(){
        await this.loadDevicesFromServer();
    }
    async onRequestGenerateButtonLink(request){
        const command = request.command;
        const apiKey = this._apiKey;
        if(!apiKey){
            await alert("To use this feature, first click the JOIN API button and click the button to show your API Key");
            if(!this.apiBuilder){
                await this.onRequestToggleShowApiBuilder()
            }
        }else{
            const device = this.selectedDevice;
            this.controlCommands.setLink({command,device,apiKey});
            const commandText = command.getText();
            await alert(`Drag '${commandText}' to your bookmarks toolbar and then click on it when you want to perform the command.\n\nMake sure to drag the '${commandText}' text (not the button around it) or else it won't work.`);
        }
    }

}
class WebSocketGCM{
    constructor(gcmRaw){
        this.gcmRaw = gcmRaw;
    }
}