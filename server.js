var twilio = require('twilio'),
    express = require('express'),
    request = require('request'),
    SHA256 = require("crypto-js/sha256"),
    bodyParser = require('body-parser');
    //requestQuery = require('query');


var port = process.env.PORT || 1337;
var app = express();
app.use(bodyParser());  //must have this to parse body of requests
//app.use(requestQuery());

// need to set environment variables VOICEIT_DEV_ID and VOICEIT_DEV_ID
console.log("password = " + process.env.VOICEIT_PASSWORD + " vstDev id= " +  process.env.VOICEIT_DEV_ID);

//update password
//var voiceitPassword = SHA256(process.env.VOICEIT_PASSWORD);
var voiceitDeveloperId = process.env.VOICEIT_DEV_ID; 


//This app has a few main areas:
// 1. /incoming_call - Twilio will send calls here 
// 2. a request to voiceprintportal.com will be called, to determine if this phone number exits
// 3. If not, create user
// 4. If it is a new user, goto the /enroll function
// 5. Enrollment requires at least 3 sucessfull recordings of a voice phrase 
// 6. The /authenticate method asks the user who is already enrolled to use their phrase
// 7. Currently, if the user is actually authenticated, all the app does is play a demo message  	



app.post('/incoming_call', function(req, res) { 

	//get incoming number, assemble a getUser request
	var callernumber = req.body.From;

	//voiceauth requires an email address, so we will make a fake one for this caller
	var voiceitEmail =  callernumber + "@twiliobioauth.example.com";  

	console.log("visitEmail = " + voiceitEmail);
	var voiceitPassword = SHA256(callernumber);



	var getUserOptions = {
	    url: 'https://siv.voiceprintportal.com/sivservice/api/users',
		headers: {
		    	'VsitEmail' : voiceitEmail,
		    	'VsitPassword' : voiceitPassword,
		    	'VsitDeveloperId' : voiceitDeveloperId
			}
	};




	//prepare a a Twilio response
	var resp = new twilio.TwimlResponse();

	//check for the user, if they don't exist we get error 412 and will create a new user
	request(getUserOptions, function (error, response, 	body) {
		    if (!error && response.statusCode == 200) {
		        var info = JSON.parse(body);

		        resp.say("You have called Voice Authentication. Your phone number has been recognized.");
		        resp.gather({action: "/enroll_or_authenticate", numDigits: "1", timeout: 3}, function () {
		        	this.say("You can now log in.  Or press 1 now to enroll for the first time.");
		        });
		        resp.redirect("/enroll_or_authenticate?Digits=TIMEOUT");

		        console.log(resp.toString());
  	  			res.send(resp.toString());

		    } else {
		    	console.log(response.statusCode);
		    	//412 = precodition failed.  In this case, "User not Found" - should check for a body { "Result" : "User not found" }
		    	if (response.statusCode == '412') {

						// now create user
						var createUserOptions = {
					    url: 'https://siv.voiceprintportal.com/sivservice/api/users',
						headers: {
								'VsitEmail': voiceitEmail, 
								'VsitPassword': voiceitPassword,
								'VsitDeveloperId': voiceitDeveloperId, 
								'VsitFirstName': "First" + callernumber, 
								'VsitLastName': "Last" + callernumber, 
								'VsitPhone1': callernumber
							}
						};
						console.dir(createUserOptions);
						console.log("Creating a createUser request")
						request.post(createUserOptions, callback); //not currently checking results of createUserOptions
						// if we have successully created a user, we should... <play> "we are enrolling you in the system, with an action URL = enrollment"
						resp.say("Welcome to the Voice Authentication system.  You are a new user, you will now be enrolled");
						resp.redirect({Digits: "1"}, "/enroll");
		        		console.log(resp.toString());
  	  					res.send(resp.toString());

		    	} //end if status repson code
		    } // end else
		});  // end initial request
});// end post

app.post('/enroll_or_authenticate', function(req, res) {
	digits = req.body.Digits;
	resp = new twilio.TwimlResponse(); 
	if (digits == 1) {
		resp.say("You have choosen to create a new account with your voice.  You will be asked to say a phrase 3 times.  Then you will be able to log in with that phrase.");
		resp.redirect("/enroll");
	} else {
		resp.redirect("/authenticate");
	}
	console.log(resp.toString());
  	res.send(resp.toString());

});

app.post('/enroll', function(req, res) { 

	var enrollcount = req.query.enrollCount || 0;

	//check state.. how many times has this guy unrolled?
	resp = new twilio.TwimlResponse(); 
	resp.say("Say the following phrase.")
	resp.pause("1");
	resp.say("Never forget that tomorrow is a new day");
	resp.record({action: "/process_enroll?enrollCount=" + enrollcount, trim: "do-not-trim", maxLength: "5"});
	
	console.log(resp.toString());
	res.send(resp.toString());

});


app.post('/authenticate', function(req, res) { 
	resp = new twilio.TwimlResponse(); 
	resp.say("Please say the following phrase to authenticate. ")
	resp.pause("1");
	resp.say("Never forget that tomorrow is a new day");
	resp.record({action: "/process_authentication", trim: "do-not-trim", maxLength: "5"});

	//send a twilio response
	console.log(resp.toString());
  	res.send(resp.toString());

});

app.post('/process_enroll', function(req, res) { 

	var callernumber = req.body.From;
	var enrollcount = req.query.enrollCount;
	console.dir(req.body);

	var recordingURL = req.body.RecordingUrl + ".wav";
	console.log("recording url = " + recordingURL);
	
	var visitEmail =  callernumber + "@twiliobioauth.example.com";
	console.log("visitEmail = " + visitEmail);
	var visitPassword = SHA256(callernumber);

	var enrollByWav = {
    url: 'https://siv.voiceprintportal.com/sivservice/api/enrollments/bywavurl',
	headers: {
			'VsitEmail': visitEmail, 
			'VsitPassword': visitPassword,
			'VsitDeveloperId': voiceitDeveloperId, 
			'VsitwavURL'		 : recordingURL
		}
	};


	//fire request to voiceit, check response
	//based on the voiceit response, say "You have authenticatd! Great!"
	request.post(enrollByWav, function (error, response, body) {
		resp = new twilio.TwimlResponse();
	    if (!error && response.statusCode == 200) {

	        var info = JSON.parse(body);
	        console.log(info);
	        console.log("info.Result = " + info.Result)
	        if (info.Result == "Success") { 

			        console.log("great success in enrolling via IVR... lets check how many times we've enrolled!");
	        		enrollcount++;
	        		console.log("enrollcount = " + enrollcount);
			        if (enrollcount > 2) {
			        	// we have 3 sucessfull enrollments, therefore, lets thank them and move on
			        	resp.say("Thank you, recording recieved. You are now enrolled. You can log in.");
						resp.redirect("/authenticate");
			        } else {
			        	resp.say("Thank you, recording recieved. You will now be asked to record your phrase again.");
						resp.redirect("/enroll?enrollCount=" + enrollcount);
			        }
			 } else {
			 	resp.say("Sorry, your recording did not stick. Please try again");
			 	resp.redirect("/enroll?enrollCount=" + enrollcount);

			 }
	    } else {
	    	console.log("terrible error!");
	    	
	    	resp.say("Sorry, your recording did not stick. Please try again");
			resp.redirect("/enroll?enrollCount=" + enrollcount);

	    	console.log(response.statusCode);
	    	console.log(body);
	    	//what to do here.. 
	    }
	    console.log(resp.toString());
  		res.send(resp.toString());
    });


});

app.post('/process_authentication', function(req, res) { 

	var callernumber = req.body.From;
	var visitEmail =  callernumber + "@twiliobioauth.example.com";
	console.log("visitEmail = " + visitEmail);
	var visitPassword = SHA256(callernumber);

 
	var recordingURL = req.body.RecordingUrl + ".wav";
	console.log("recording url = " + recordingURL);
	console.dir(req.body);

	 

	var authenticateByWav = {
	    url: 'https://siv.voiceprintportal.com/sivservice/api/authentications/bywavurl',
		headers: {
				'VsitEmail': visitEmail, 
				'VsitPassword': visitPassword,
				'VsitDeveloperId': voiceitDeveloperId, 
				'VsitwavURL': recordingURL,
				'VsitAccuracy':		   5,
				'VsitAccuracyPasses':	 4,
				'VsitAccuracyPassIncrement': 2,
				'VsitConfidence': 87	
			}
		};

	//fire request to voiceit, check response
	//based on the voiceit response, say "You have authenticatd! Great!"
	request.post(authenticateByWav, function (error, response, body) {
		resp = new twilio.TwimlResponse(); 
	    if (!error && response.statusCode == 200) {
	        var info = JSON.parse(body);
	        console.log("great success authenticting!" + info);
	        if (info.Result == "Authentication failed.") {
	        	//not confidence
	        	resp.say("Your authentication did not pass. Please try again..");
				resp.redirect("/authenticate");
	        } else {
	        	resp.say("Great Success!  I'm a lowly robot, and I recognized your voice. Thank you, you are now authenticated.   This is the end of the demo.");
	        }
	        //parse the body.result.. 
	        console.log(info);
	        	// we have 3 sucessfull enrollments, therefore, lets thank them and move o    
	  
	    } else {
	    	resp.say("API Error.  Your authentication did not pass. Please try again..");
			resp.redirect("/authenticate");

	    	console.log(response.statusCode);
	    	console.log(body);
	    	//what to do here.. 
	    }
	    console.log(resp.toString());
  		res.send(resp.toString());
    });

	

});

function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        console.log("great success!");
        console.log(info);
    } else {
    	console.log("terrible error!");
    	console.log(response.statusCode);
    	console.log(body);
    }
    return response.statusCode;
}
	


app.listen(port);
console.log('Up and running for bioauthentication on port ' + port);

